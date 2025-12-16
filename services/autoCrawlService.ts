import { Article, UserProfile, ContentMedia, TraceRun, TraceStep } from '../types';
import { searchXHSNotes, getXHSNoteDetail, XHSNote, XHSNoteDetail } from './xhsService';

const API_KEY = typeof process !== 'undefined' ? process.env.GEMINI_API_KEY : '';

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
  trace?: TraceLogger,
  onLog?: (log: string) => void
): Promise<KeywordGenerationResult> {
  const log = (msg: string) => onLog?.(msg);
  const stepId = trace ? await trace.startStep('生成搜索关键词', { profile_interests: profile.interests }) : '';

  log('正在分析用户画像，生成搜索关键词...');

  const prompt = `你是一个内容推荐系统的关键词生成器。根据用户画像，生成10个小红书搜索关键词。

用户画像：
- 性别: ${profile.demographics?.gender || '未知'}
- 年龄段: ${profile.demographics?.age_range || '未知'}
- 兴趣领域: ${(profile.interests || []).join(', ') || '未指定'}
- 最近感兴趣的话题: ${(profile.recent_topics || []).join(', ') || '未指定'}
- 问卷回答: ${JSON.stringify(profile.answers || {})}

要求：
1. 生成10个搜索关键词
2. 关键词要具体、可搜索，能找到高质量内容
3. 覆盖用户的主要兴趣领域
4. 包含一些探索性关键词（用户可能感兴趣但未明确表达的）
5. 关键词长度适中（2-6个字）

请按以下JSON格式返回：
{
  "keywords": ["关键词1", "关键词2", ...],
  "reasoning": "简要说明生成这些关键词的理由"
}`;

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
      await trace.completeStep(stepId, { keywords: result.keywords });
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
  localImages: string[]
): Article {
  const noteImages = note.images || [];
  const desc = note.desc || '';
  const media: ContentMedia[] = localImages.map((url, i) => ({
    type: 'image' as const,
    url_local: url,
    url_source: noteImages[i] || '',
    order: i
  }));

  const likesNum = parseNumber(note.liked_count);
  const favNum = parseNumber(note.collected_count);
  const commentNum = parseNumber(note.comment_count);

  const tagsFromContent = note.tag_list || [];
  const hashtagMatches = desc.match(/#([^#\s]+)/g) || [];
  const hashtags = hashtagMatches.map(t => t.replace('#', ''));
  const allTags = [...new Set([...tagsFromContent, ...hashtags])];

  const imagesMarkdown = localImages.map((url, i) => `![图片${i + 1}](${url})`).join('\n\n');

  return {
    id: `xhs-${note.id}-${Date.now()}`,
    source: 'xhs',
    source_item_id: note.id,
    original_url: `https://www.xiaohongshu.com/explore/${note.id}`,
    title: note.title || desc.slice(0, 50) || '无标题',
    summary: desc.slice(0, 200),
    content: `${desc}\n\n${imagesMarkdown}`,
    content_plain: desc,
    author: {
      id: note.user?.user_id || '',
      name: note.user?.nickname || '未知用户',
      avatar: note.user?.avatar || ''
    },
    media,
    imageUrl: localImages[0] || '',
    category: keyword,
    tags: allTags,
    topics: [keyword],
    tone: 'Casual',
    estimatedReadTime: Math.ceil((desc.length || 1) / 300) * 60,
    language: 'zh',
    metrics: {
      likes: likesNum,
      favorites: favNum,
      comments: commentNum,
      shares: 0
    },
    created_at: Date.now(),
    publish_time: note.time ? note.time * 1000 : Date.now(),
    crawl_context: {
      keyword,
      crawled_at: Date.now()
    },
    status: 'active',
    isPublic: true
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

async function saveArticle(article: Article): Promise<void> {
  await fetch('/api/articles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(article)
  });
}

export async function crawlAndImportByKeywords(
  keywords: string[],
  notesPerKeyword: number = 5,
  trace?: TraceLogger,
  onLog?: (log: string) => void,
  onProgress?: (progress: CrawlProgress[]) => void
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
      const searchResult = await searchXHSNotes(keyword, 1, 20, 'popular');
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

          const article = convertXHSNoteToArticle(noteDetail, keyword, localImages);
          await saveArticle(article);
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
