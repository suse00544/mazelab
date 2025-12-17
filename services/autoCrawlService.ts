import { Article, UserProfile, ContentMedia, TraceRun, TraceStep } from '../types';
import { searchXHSNotes, getXHSNoteDetail, XHSNote, XHSNoteDetail } from './xhsService';
import { db } from './db';

const API_KEY = typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '';

// ==================== 关键词生成 Prompt 拆分 ====================

// 固定前言：冷启动关键词生成
export const FIXED_KEYWORD_COLD_START_PREAMBLE = `你是一个内容推荐系统的关键词生成器。
根据用户画像，生成小红书搜索关键词来扩充内容库。

**用户画像（User Profile）：**
{{USER_PROFILE}}`;

// 默认任务指令：冷启动关键词生成
export const DEFAULT_KEYWORD_COLD_START_TASK = `**分析任务 (Keyword Generation Task):**
1. **用户兴趣识别**：
   - 从用户描述中提取核心兴趣点
   - 识别用户的内容偏好（风格、深度、类型）
   - 注意用户明确表达的需求

2. **关键词生成策略**：
   - 生成 **8-10个** 搜索关键词
   - 关键词要具体、可搜索，能找到高质量内容
   - 覆盖用户的主要兴趣领域
   - 包含 2-3 个探索性关键词（用户可能感兴趣但未明确表达的）
   - 关键词长度适中（2-6个字）

3. **输出要求**：
   - 返回严格的 JSON 格式
   - 包含 keywords 数组和 reasoning 字段

Output strict JSON:
{
  "keywords": ["关键词1", "关键词2", ...],
  "reasoning": "简要说明生成这些关键词的理由"
}`;

// 固定前言：基于交互的关键词生成
export const FIXED_KEYWORD_INTERACTION_PREAMBLE = `你是一个内容推荐系统的关键词生成器。
基于用户的交互历史，生成新的小红书搜索关键词来扩充内容库。

**用户交互历史（最近的交互）：**
{{INTERACTION_HISTORY}}

**当前轮次：** 第 {{ROUND_INDEX}} 刷`;

// 默认任务指令：基于交互的关键词生成
export const DEFAULT_KEYWORD_INTERACTION_TASK = `**分析任务 (Keyword Generation Task):**
1. **交互行为分析**：
   - 识别用户点击和喜欢的内容主题
   - **特别注意用户的评论，这是最强的兴趣信号**
   - 识别用户跳过的内容类型，避免生成相关关键词
   - 观察用户兴趣的演进趋势（从一个主题到另一个主题）

2. **关键词生成策略**：
   - 生成 **5-8个** 新的搜索关键词
   - 关键词要具体、可搜索
   - 70% 匹配用户已表现的兴趣（Exploitation）
   - 30% 探索新的相关领域（Exploration）
   - 关键词长度适中（2-6个字）
   - **不要重复之前已经搜索过的关键词**

3. **输出要求**：
   - 返回严格的 JSON 格式
   - 包含 keywords 数组和 reasoning 字段

Output strict JSON:
{
  "keywords": ["关键词1", "关键词2", ...],
  "reasoning": "简要说明为什么生成这些关键词（基于观察到的用户行为模式）"
}`;

interface KeywordGenerationResult {
  keywords: string[];
  reasoning: string;
}

interface CrawlProgress {
  keyword: string;
  status: 'pending' | 'crawling' | 'completed' | 'failed';
  notesFound: number;
  notesImported: number;
}

export class TraceLogger {
  private runId: string;
  private userId: string;
  private experimentId?: string;

  constructor(userId: string, experimentId?: string) {
    this.runId = `trace-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.userId = userId;
    this.experimentId = experimentId;
  }

  async startRun(type: TraceRun['type']): Promise<string> {
    try {
      await fetch('/api/trace/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: this.runId,
          experiment_id: this.experimentId,
          user_id: this.userId,
          type
        })
      });
    } catch (e) {
      console.error('[Trace] Failed to start run:', e);
    }
    return this.runId;
  }

  async startStep(stepName: string, input?: any): Promise<string> {
    const stepId = `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    try {
      await fetch('/api/trace/step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: stepId,
          run_id: this.runId,
          step_name: stepName,
          input
        })
      });
    } catch (e) {
      console.error('[Trace] Failed to start step:', e);
    }
    return stepId;
  }

  async completeStep(stepId: string, output?: any, error?: string): Promise<void> {
    try {
      await fetch(`/api/trace/step/${stepId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: error ? 'failed' : 'completed',
          output,
          error
        })
      });
    } catch (e) {
      console.error('[Trace] Failed to complete step:', e);
    }
  }

  async endRun(status: 'completed' | 'failed'): Promise<void> {
    try {
      await fetch(`/api/trace/run/${this.runId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
    } catch (e) {
      console.error('[Trace] Failed to end run:', e);
    }
  }

  getRunId(): string {
    return this.runId;
  }
}

export async function generateKeywordsFromProfile(
  profile: UserProfile,
  apiKey: string,
  customPrompt?: string,
  trace?: TraceLogger,
  onLog?: (log: string) => void
): Promise<KeywordGenerationResult> {
  const log = (msg: string) => onLog?.(msg);

  // 构建用户画像文本
  const userProfileText = `- 性别: ${profile.demographics?.gender || '未知'}
- 年龄段: ${profile.demographics?.age_range || '未知'}
- 兴趣领域: ${(profile.interests || []).join(', ') || '未指定'}
- 最近感兴趣的话题: ${(profile.recent_topics || []).join(', ') || '未指定'}
- 问卷回答: ${JSON.stringify(profile.answers || {})}`;

  // 使用自定义任务指令或默认任务指令
  const taskPrompt = customPrompt || DEFAULT_KEYWORD_COLD_START_TASK;

  // 拼接固定前言 + 任务指令
  const promptTemplate = FIXED_KEYWORD_COLD_START_PREAMBLE + '\n\n' + taskPrompt;
  const prompt = promptTemplate.replace('{{USER_PROFILE}}', userProfileText);

  // 记录到 trace（包含固定前言、任务指令和输入信息）
  const stepId = trace ? await trace.startStep('生成搜索关键词（冷启动）', {
    fixed_preamble: FIXED_KEYWORD_COLD_START_PREAMBLE,
    task_prompt: taskPrompt,
    user_profile: profile,
    final_prompt: prompt
  }) : '';

  log('正在分析用户画像，生成搜索关键词...');

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt
    });

    const text = response.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('无法解析关键词响应');
    }

    const result: KeywordGenerationResult = JSON.parse(jsonMatch[0]);
    log(`生成了 ${result.keywords.length} 个关键词: ${result.keywords.join(', ')}`);

    if (trace && stepId) {
      await trace.completeStep(stepId, {
        keywords: result.keywords,
        reasoning: result.reasoning,
        raw_response: text
      });
    }

    return result;
  } catch (e: any) {
    log(`关键词生成失败: ${e.message}`);
    if (trace && stepId) {
      await trace.completeStep(stepId, null, e.message);
    }
    throw e;
  }
}

export async function generateKeywordsFromInteractions(
  interactions: any[],
  roundIndex: number,
  apiKey: string,
  customPrompt?: string,
  trace?: TraceLogger,
  onLog?: (log: string) => void
): Promise<KeywordGenerationResult> {
  const log = (msg: string) => onLog?.(msg);

  log(`正在分析第 ${roundIndex} 轮交互历史，生成新的搜索关键词...`);

  // 构建交互摘要
  const interactionSummary = interactions.map(i => ({
    article: i.articleContext?.title || '未知',
    tags: i.articleContext?.tags,
    action: i.clicked ? 'CLICKED' : 'SKIPPED',
    liked: i.liked,
    comment: i.comment
  }));

  const interactionHistoryText = JSON.stringify(interactionSummary.slice(-20), null, 2);

  // 使用自定义任务指令或默认任务指令
  const taskPrompt = customPrompt || DEFAULT_KEYWORD_INTERACTION_TASK;

  // 拼接固定前言 + 任务指令
  const promptTemplate = FIXED_KEYWORD_INTERACTION_PREAMBLE + '\n\n' + taskPrompt;
  const prompt = promptTemplate
    .replace('{{INTERACTION_HISTORY}}', interactionHistoryText)
    .replace('{{ROUND_INDEX}}', roundIndex.toString());

  // 记录到 trace（包含固定前言、任务指令和输入信息）
  const stepId = trace ? await trace.startStep('生成搜索关键词（基于交互）', {
    fixed_preamble: FIXED_KEYWORD_INTERACTION_PREAMBLE,
    task_prompt: taskPrompt,
    interaction_count: interactions.length,
    interaction_summary: interactionSummary.slice(-20),
    round_index: roundIndex,
    final_prompt: prompt
  }) : '';

  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt
    });

    const text = response.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('无法解析关键词响应');
    }

    const result: KeywordGenerationResult = JSON.parse(jsonMatch[0]);
    log(`生成了 ${result.keywords.length} 个关键词: ${result.keywords.join(', ')}`);
    log(`生成理由: ${result.reasoning}`);

    if (trace && stepId) {
      await trace.completeStep(stepId, {
        keywords: result.keywords,
        reasoning: result.reasoning,
        raw_response: text
      });
    }

    return result;
  } catch (e: any) {
    log(`关键词生成失败: ${e.message}`);
    if (trace && stepId) {
      await trace.completeStep(stepId, null, e.message);
    }
    throw e;
  }
}

async function downloadAndSaveImage(url: string): Promise<string> {
  try {
    const res = await fetch('/api/image-download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const data = await res.json();
    return data.url || url;
  } catch (e) {
    return url;
  }
}

function convertXHSNoteToArticle(
  note: XHSNoteDetail,
  keyword: string,
  localImages: string[],
  userId: string,
  libraryType: 'personal' | 'community' = 'community',
  xsecToken?: string,
  coverUrl?: string,
  experimentId?: string
): any {
  // 处理 tag_list：过滤掉对象类型的标签，只保留字符串
  const tagList = (note.tag_list || [])
    .filter((tag: any) => typeof tag === 'string')
    .map((tag: string) => tag.trim());

  // 处理 desc：删除话题标签 #xxx[话题]#（和手动保存逻辑一致）
  const rawDesc = note.desc || '';
  const desc = tagList.length > 0
    ? rawDesc.replace(/#[^#\n]+\[话题\]#/g, '').trim()
    : rawDesc;

  // 提取标签
  const hashtagMatches = desc.match(/#([^#\s]+)/g) || [];
  const hashtags = hashtagMatches.map(t => t.replace('#', ''));
  const allTags = [...new Set([...tagList, ...hashtags])];

  // 处理 cover：确保是字符串而不是对象
  let coverStr = '';
  if (coverUrl && typeof coverUrl === 'string') {
    coverStr = coverUrl;
  } else if ((note as any).cover) {
    const noteCover = (note as any).cover;
    coverStr = typeof noteCover === 'string' ? noteCover : (noteCover.url || '');
  } else if (localImages[0]) {
    coverStr = localImages[0];
  }

  // 构建 media 数组（通用格式）
  const media: ContentMedia[] = localImages.map((url, i) => ({
    type: 'image' as const,
    url_local: url,
    url_source: note.images?.[i] || '',
    order: i
  }));

  // content 只保存纯文本，不包含图片（图片已保存在 images 字段中，避免重复显示）
  // 这样和手动保存的行为一致
  const fullContent = desc;

  // 构建作者信息（JSON格式，用于通用查询）
  const author = {
    id: note.user?.user_id || '',
    name: note.user?.nickname || '未知用户',
    avatar: note.user?.avatar || ''
  };

  // 返回完整的文章对象，包含：
  // 1. 通用字段（适用于所有来源）
  // 2. 小红书特定字段（便于小红书专属查询）
  return {
    // ========== 核心字段 ==========
    id: `xhs-${note.id}-${Date.now()}`,
    source: 'xhs',
    source_item_id: note.id,
    original_url: `https://www.xiaohongshu.com/discovery/item/${note.id}`,

    // ========== 内容字段（通用） ==========
    title: note.title || desc.slice(0, 50) || '无标题',
    content: fullContent,
    content_plain: desc,
    summary: desc.slice(0, 200),

    // ========== 作者信息（通用 + 小红书特定） ==========
    author: author,
    user_id: note.user?.user_id || '',
    user_nickname: note.user?.nickname || '未知用户',
    user_avatar: note.user?.avatar || '',

    // ========== 媒体资源 ==========
    media: media,
    imageUrl: localImages[0] || '',
    cover: coverStr,
    cover_url: coverStr,
    images: localImages,
    video_url: note.video_url || '',

    // ========== 小红书特定字段 ==========
    xsec_token: xsecToken || (note as any).xsec_token || '',
    note_type: note.type || null,
    desc: desc,
    type: note.type || 'normal',

    // ========== 统计数据 ==========
    liked_count: note.liked_count || '0',
    collected_count: note.collected_count || '0',
    comment_count: note.comment_count || '0',
    share_count: note.share_count || '0',

    // ========== 标签 ==========
    tags: allTags,
    topics: [keyword],
    tag_list: tagList,

    // ========== 其他元数据 ==========
    tone: 'Casual',
    estimatedReadTime: Math.ceil((desc.length || 1) / 300) * 60,
    language: 'zh',

    // ========== 时间字段 ==========
    time: note.time || 0,
    publish_time: note.time ? note.time * 1000 : Date.now(),
    created_at: Date.now(),
    updated_at: Date.now(),

    // ========== 库管理字段 ==========
    library_type: libraryType,
    owner_id: userId,
    experiment_id: experimentId,
    isPublic: true,
    status: 'active'
  };
}

function parseNumber(str: string | number): number {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  const num = parseFloat(str.replace(/[万w]/i, ''));
  if (str.includes('万') || str.toLowerCase().includes('w')) {
    return Math.round(num * 10000);
  }
  return Math.round(num) || 0;
}


export async function crawlAndImportByKeywords(
  keywords: string[],
  notesPerKeyword: number = 5,
  userId: string,
  trace?: TraceLogger,
  onLog?: (log: string) => void,
  onProgress?: (progress: CrawlProgress[]) => void,
  libraryType: 'personal' | 'community' = 'community',  // 默认社区库
  experimentId?: string  // 实验ID（Personal库专用）
): Promise<Article[]> {
  const log = (msg: string) => onLog?.(msg);
  const allArticles: Article[] = [];
  
  const progress: CrawlProgress[] = keywords.map(k => ({
    keyword: k,
    status: 'pending',
    notesFound: 0,
    notesImported: 0
  }));
  onProgress?.(progress);

  for (let i = 0; i < keywords.length; i++) {
    const keyword = keywords[i];
    progress[i].status = 'crawling';
    onProgress?.([...progress]);

    const stepId = trace ? await trace.startStep(`搜索: ${keyword}`, { keyword, limit: notesPerKeyword }) : '';
    log(`[${i + 1}/${keywords.length}] 搜索关键词: ${keyword}`);

    try {
      // 使用 'general' 排序 + 'image' 类型，只获取图文内容
      const searchResult = await searchXHSNotes(keyword, 1, 20, 'general', 'image');
      if (!searchResult.success || !searchResult.notes) {
        log(`  搜索失败或无结果`);
        progress[i].status = 'failed';
        if (trace && stepId) await trace.completeStep(stepId, null, '搜索失败');
        continue;
      }

      const notes = searchResult.notes.slice(0, notesPerKeyword);
      progress[i].notesFound = notes.length;
      log(`  找到 ${notes.length} 篇笔记`);

      for (let j = 0; j < notes.length; j++) {
        const note = notes[j];
        try {
          const detailResult = await getXHSNoteDetail(note.id, note.xsec_token);
          if (!detailResult.success || !detailResult.note) {
            log(`    [${j + 1}] 获取详情失败`);
            continue;
          }

          const noteDetail = detailResult.note;
          const localImages: string[] = [];
          const noteImages = noteDetail.images || [];
          
          for (const imgUrl of noteImages) {
            const localUrl = await downloadAndSaveImage(imgUrl);
            localImages.push(localUrl);
          }

          // 传递 xsec_token、cover、userId、libraryType 和 experimentId 信息
          const article = convertXHSNoteToArticle(
            noteDetail,
            keyword,
            localImages,
            userId,           // 传递用户ID作为所有者/贡献者
            libraryType,      // 传递库类型
            note.xsec_token,  // 传递搜索返回的 xsec_token
            note.cover,       // 传递搜索返回的 cover
            experimentId      // 传递实验ID
          );
          await db.saveArticle(article);
          allArticles.push(article);
          progress[i].notesImported++;
          log(`    [${j + 1}] 入库成功: ${article.title.slice(0, 30)}...`);
        } catch (e: any) {
          log(`    [${j + 1}] 处理失败: ${e.message}`);
        }

        await new Promise(r => setTimeout(r, 500));
      }

      progress[i].status = 'completed';
      onProgress?.([...progress]);
      
      if (trace && stepId) {
        await trace.completeStep(stepId, { 
          found: notes.length, 
          imported: progress[i].notesImported 
        });
      }

    } catch (e: any) {
      log(`  搜索出错: ${e.message}`);
      progress[i].status = 'failed';
      if (trace && stepId) await trace.completeStep(stepId, null, e.message);
    }

    await new Promise(r => setTimeout(r, 1000));
  }

  log(`\n爬取完成！共入库 ${allArticles.length} 篇内容`);
  return allArticles;
}
