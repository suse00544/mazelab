import { GoogleGenAI, Type } from "@google/genai";
import {
  Interaction,
  RecommendationStrategy,
  RecommendationResponse,
  Article,
  DebugInfo,
  CandidateItem,
  GeneratedContentBatch,
  Stage1UserProfile,
  Stage2RecallResult,
  Stage3FilterResult,
  Stage4RankResult,
  UnifiedRecommendationResult,
  Experiment
} from "../types";
import { db } from "./db";
import {
  STAGE1_SYSTEM_PROMPT,
  STAGE1_DEFAULT_USER_PROMPT,
  STAGE2_SYSTEM_PROMPT,
  STAGE2_DEFAULT_USER_PROMPT,
  STAGE3_SYSTEM_PROMPT,
  STAGE3_DEFAULT_USER_PROMPT,
  STAGE4_SYSTEM_PROMPT,
  STAGE4_DEFAULT_USER_PROMPT,
  DEFAULT_RECOMMENDATION_CONFIG
} from "./defaultPrompts";

const getClient = () => {
  // 从 localStorage 获取用户输入的 API Key（安全：不会暴露在代码中）
  const apiKey = typeof window !== 'undefined' ? localStorage.getItem('GEMINI_API_KEY') : null;
  if (!apiKey) {
    throw new Error("请先在设置中配置 Gemini API Key。点击右上角的设置按钮输入你的 API Key。");
  }
  return new GoogleGenAI({ apiKey });
};

export const checkModelHealth = async (modelName: string): Promise<boolean> => {
    try {
        const ai = getClient();
        await ai.models.generateContent({
            model: modelName,
            contents: "Hi",
        });
        return true;
    } catch (e) {
        console.error(`Health check failed for ${modelName}`, e);
        return false;
    }
}

// Updated to accept data instead of fetching synchronously
const buildEvolutionaryLog = (interactions: Interaction[], allSessions: GeneratedContentBatch[], allArticles: Article[], userDescription?: string) => {
  // 冷启动:如果没有交互记录但有用户描述,返回初始上下文
  if ((!interactions || interactions.length === 0) && userDescription) {
    return [{
      session_id: 'cold_start',
      note: '🌟 这是用户第一次使用系统,以下是用户的初始需求描述:',
      user_input: userDescription,
      interactions: []  // 保持结构一致性
    }];
  }

  if (!interactions || interactions.length === 0) return [];

  const articleMap = new Map(allArticles.map(a => [a.id, a]));
  const sessionOrderMap = new Map<string, string[]>();
  allSessions.forEach(s => {
      sessionOrderMap.set(s.sessionId, s.articles.map(a => a.id));
  });

  const interactionsBySession = new Map<string, Interaction[]>();
  interactions.forEach(i => {
      if (!interactionsBySession.has(i.sessionId)) {
          interactionsBySession.set(i.sessionId, []);
      }
      interactionsBySession.get(i.sessionId)?.push(i);
  });

  const processedSessions: any[] = [];
  allSessions.forEach(session => {
      const sessionInts = interactionsBySession.get(session.sessionId);
      if (!sessionInts || sessionInts.length === 0) return;

      const orderList = sessionOrderMap.get(session.sessionId) || [];

      sessionInts.sort((a, b) => {
          const idxA = orderList.indexOf(a.articleId);
          const idxB = orderList.indexOf(b.articleId);
          if (idxA === -1 && idxB === -1) return a.timestamp - b.timestamp;
          if (idxA === -1) return 1;
          if (idxB === -1) return -1;
          return idxA - idxB;
      });

      const mappedInteractions = sessionInts.map(i => {
          const article = articleMap.get(i.articleId);
          return {
              article_context: {
                title: i.articleContext.title,
                tags: i.articleContext.tags,
                content: i.articleContext.summary || article?.desc || article?.content || "内容不可用"
              },
              user_behavior: {
                action: i.clicked ? "CLICKED_AND_VIEWED" : "SKIPPED_IN_FEED",
                time_spent_seconds: i.dwellTime,
                read_percentage: i.clicked ? Math.round(i.scrollDepth * 100) + '%' : '0%',
                interactions: {
                  liked: i.liked,
                  favorited: i.favorited,
                  comment: i.comment || null
                }
              }
          };
      });

      processedSessions.push({
          session_id: session.sessionId,
          interactions: mappedInteractions
      });
  });

  // Flatten all interactions, keep last 30, then regroup by session
  const allInteractionsFlat: { sessionId: string; interaction: any }[] = [];
  processedSessions.forEach(s => {
      s.interactions.forEach((i: any) => {
          allInteractionsFlat.push({ sessionId: s.session_id, interaction: i });
      });
  });
  const last30 = allInteractionsFlat.slice(-30);
  
  // Rebuild session structure from last 30 interactions
  const regrouped = new Map<string, any[]>();
  last30.forEach(item => {
      if (!regrouped.has(item.sessionId)) {
          regrouped.set(item.sessionId, []);
      }
      regrouped.get(item.sessionId)?.push(item.interaction);
  });
  
  return Array.from(regrouped.entries()).map(([sessionId, interactions]) => ({
      session_id: sessionId,
      interactions
  }));
};

export const FIXED_STRATEGY_PREAMBLE = `你是一位专家级推荐系统策略师。
以下是该用户在最近几个推荐 Session 中的完整交互日志。
**日志结构说明：**
1. 按 Session 时间顺序排列 (Session 1 -> Session 2)。
2. 每个 Session 内部，交互记录**严格按照文章在 Feed 流中展示的顺序**排列（即用户看到的顺序）。
   - 这意味着记录反映了用户的浏览路径：从上到下。
   - 注意区分 "CLICKED_AND_VIEWED" (点击阅读) 和 "SKIPPED_IN_FEED" (滑过未点)。
   - 连续的 SKIPPED 可能意味着该区域的内容缺乏吸引力。

**用户交互历史 (按 Session 分组的演进轨迹):**
{{HISTORY}}`;

export const DEFAULT_STRATEGY_TASK = `**分析任务:**
1. **兴趣演进分析 (Critical)**:
   - 观察用户从一个 Session 到下一个 Session 的兴趣变化。
   - 之前的推荐策略是否有效？用户对上一轮推荐的内容（尤其是高交互或评论过的内容）反馈如何？
   - 识别当前的兴趣转移趋势（例如：从“入门”转向“专家”，或从“AI”转向“产品”）。

2. **显式反馈处理**:
   - 用户的评论 (comment) 是最高优先级的指令。如果用户在评论中表达了喜好或厌恶，必须在下一轮策略中立即体现。

3. **制定下一轮策略**:
   - 基于上述演进分析，确定下一个 Session 的推荐重点。
   - 设定个性化 (Personalization)、探索 (Exploration) 和 惊喜 (Serendipity) 的比例。

**请注意：返回的 JSON 键名必须保持英文 (如 user_profile, personalization_ratio)，但 JSON 所有的字符串值内容必须是中文。**

Output strict JSON.`;

export const FIXED_CONTENT_PREAMBLE = `你是一个推荐系统的精排模型 (Ranking Model)。
你的任务是根据用户的交互历史，从给定的【候选集】中挑选出最合适的文章。

**1. 用户交互历史 (演进轨迹):**
{{HISTORY}}

**2. 候选文章集 (Candidate Set - Metadata Only):**
{{CANDIDATES}}`;

export const DEFAULT_CONTENT_TASK = `**选品任务 (Selection Task):**
1. **分析匹配度**: 将候选集中的文章与用户的最新兴趣画像进行匹配。
2. **执行策略**: 请严格遵守刚才生成的策略配比（个性化 vs 探索）。如果用户显式表达了不喜欢某类内容，请在候选中剔除。
3. **输出要求**:
   - 挑选 **5** 篇最佳文章。
   - 返回一个 JSON 对象，必须包含一个 \`selected_article_ids\` 数组。
   - 数组中只包含文章的 \`id\` 字符串。

Output strict JSON.`;

type LogCallback = (msg: string) => void;
type UpdateCallback = (info: Partial<DebugInfo>) => void;

export const generateStrategy = async (evolutionaryLogs: any[], modelName: string, taskPrompt: string, onLog: LogCallback, onUpdate: UpdateCallback): Promise<{ parsed: RecommendationStrategy, prompt: string }> => {
  const STEP = 'Strategy';
  onLog(`[${STEP}] Initializing strategy analysis...`);
  
  const ai = getClient();
  const fullPrompt = FIXED_STRATEGY_PREAMBLE.replace('{{HISTORY}}', JSON.stringify(evolutionaryLogs, null, 2)) + "\n" + taskPrompt;
  onUpdate({ strategyPrompt: fullPrompt });

  try {
    onLog(`[${STEP}] Sending request to Gemini...`);
    const startTime = Date.now();
    
    const response = await ai.models.generateContent({
      model: modelName, 
      contents: fullPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["user_profile", "recommendation_strategy", "detailed_reasoning"],
          properties: {
            user_profile: {
              type: Type.OBJECT,
              required: ["interests_summary", "behavior_patterns", "engagement_level"],
              properties: {
                interests_summary: { type: Type.STRING },
                behavior_patterns: { type: Type.STRING },
                engagement_level: { type: Type.STRING },
              }
            },
            recommendation_strategy: {
               type: Type.OBJECT,
               required: ["personalization_ratio", "exploration_ratio", "serendipity_ratio", "personalized_approach", "exploration_approach"],
               properties: {
                 personalization_ratio: { type: Type.NUMBER },
                 exploration_ratio: { type: Type.NUMBER },
                 serendipity_ratio: { type: Type.NUMBER },
                 personalized_approach: { type: Type.STRING },
                 exploration_approach: { type: Type.STRING },
               }
            },
            detailed_reasoning: {
              type: Type.OBJECT,
              required: ["why_personalized", "why_exploration", "what_to_avoid"],
              properties: {
                why_personalized: { type: Type.STRING },
                why_exploration: { type: Type.STRING },
                what_to_avoid: { type: Type.STRING },
              }
            }
          }
        }
      }
    });

    const duration = (Date.now() - startTime) / 1000;
    onLog(`[${STEP}] Response received in ${duration}s`);
    
    if (!response.text) throw new Error("Response text is empty");
    const parsed = JSON.parse(response.text) as RecommendationStrategy;
    onUpdate({ strategyResponse: parsed });
    return { parsed, prompt: fullPrompt };
  } catch (error: any) {
    onLog(`[${STEP}] ERROR: ${error.message}`);
    throw error;
  }
};

export const selectContent = async (evolutionaryLogs: any[], candidates: CandidateItem[], modelName: string, taskPrompt: string, onLog: LogCallback, onUpdate: UpdateCallback): Promise<{ parsed: RecommendationResponse, prompt: string }> => {
  const STEP = 'Selection';
  onLog(`[${STEP}] Initializing ranking model...`);
  
  const ai = getClient();
  let fullPrompt = FIXED_CONTENT_PREAMBLE.replace('{{HISTORY}}', JSON.stringify(evolutionaryLogs, null, 2));
  fullPrompt = fullPrompt.replace('{{CANDIDATES}}', JSON.stringify(candidates, null, 2));
  fullPrompt += "\n" + taskPrompt;
  onUpdate({ contentPrompt: fullPrompt });

  try {
    onLog(`[${STEP}] Sending candidate set (${candidates.length} items)...`);
    const startTime = Date.now();

    const response = await ai.models.generateContent({
      model: modelName, 
      contents: fullPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["selected_article_ids"],
          properties: {
            selected_article_ids: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            reasoning: { type: Type.STRING }
          }
        }
      }
    });

    const duration = (Date.now() - startTime) / 1000;
    onLog(`[${STEP}] Response received in ${duration}s`);
    if (!response.text) throw new Error("Response text is empty");
    const parsed = JSON.parse(response.text) as RecommendationResponse;
    onUpdate({ contentResponse: parsed });
    return { parsed, prompt: fullPrompt };
  } catch (error: any) {
    onLog(`[${STEP}] ERROR: ${error.message}`);
    throw error;
  }
};

export const runRecommendationPipeline = async (
    interactions: Interaction[],
    modelName: string,
    strategyTaskPrompt: string,
    contentTaskPrompt: string,
    onLog: LogCallback,
    onUpdate: UpdateCallback,
    contextUserId?: string,
    contextExpId?: string,
    experimentMode?: 'solo' | 'community',
    userDescription?: string
) => {
  onLog('[Pipeline] Starting...');
  const logBuffer: string[] = [];
  const captureLog = (msg: string) => { logBuffer.push(msg); onLog(msg); };

  const userId = interactions.length > 0 ? interactions[0].userId : contextUserId;
  if (!userId) throw new Error("No user context.");

  // 1. Fetch Async Data for Context
  const expId = interactions.length > 0 ? interactions[0].experimentId : contextExpId;
  if (!expId) throw new Error("No experiment context.");
  captureLog('[Data] Fetching sessions & articles for history context...');
  const [sessions, allArticles] = await Promise.all([
      db.getExperimentSessions(expId),
      db.getAllArticles()
  ]);

  // 2. Build History Logs (包含冷启动处理)
  const evolutionaryLogs = buildEvolutionaryLog(interactions, sessions, allArticles, userDescription);
  if (userDescription && evolutionaryLogs.length > 0 && evolutionaryLogs[0].session_id === 'cold_start') {
    captureLog('[Pipeline] 冷启动模式:使用用户初始描述作为上下文');
  }
  onUpdate({ rawInteractions: evolutionaryLogs });

  // 3. Recall
  captureLog('[Recall] Fetching candidates...');
  // 根据实验模式从相应的库获取候选内容（传递 experimentId 以过滤个人库）
  const libraryType = experimentMode === 'solo' ? 'personal' : experimentMode === 'community' ? 'community' : undefined;
  const candidates = await db.getCandidatesForUser(userId, 50, libraryType, expId);
  captureLog(`[Recall] Retrieved ${candidates.length} candidates from ${libraryType || 'all'} library (expId: ${expId}).`);

  try {
    const [strategyResult, contentResult] = await Promise.all([
      generateStrategy(evolutionaryLogs, modelName, strategyTaskPrompt, captureLog, onUpdate),
      selectContent(evolutionaryLogs, candidates, modelName, contentTaskPrompt, captureLog, onUpdate)
    ]);

    captureLog('[Pipeline] Hydrating results...');
    const selectedIds = contentResult.parsed.selected_article_ids || [];
    let articles = await db.getArticlesByIds(selectedIds);
    
    if (articles.length === 0) {
        captureLog('[Fallback] Filling with random candidates.');
        const fallbackIds = candidates.slice(0, 5).map(c => c.id);
        articles = await db.getArticlesByIds(fallbackIds);
    }

    return { 
      strategy: strategyResult.parsed, 
      articles, 
      debug: {
          logs: logBuffer,
          rawInteractions: evolutionaryLogs,
          strategyPrompt: strategyResult.prompt,
          strategyResponse: strategyResult.parsed,
          contentPrompt: contentResult.prompt,
          contentResponse: contentResult.parsed
      } 
    };
  } catch (error: any) {
    captureLog(`[Pipeline] FATAL ERROR: ${error.message}`);
    throw error;
  }
};

// ==========================================
// 新的统一推荐流程（4 阶段）
// ==========================================

// ==========================================
// 阶段 1: 用户画像深度分析
// ==========================================
export const analyzeUserProfile = async (
  interactions: Interaction[],
  preliminaryCandidates: Array<{ id: string; title: string; tags: string[] }>,
  roundIndex: number,
  modelName: string,
  customPrompt: string | undefined,
  onLog: LogCallback,
  onUpdate: UpdateCallback
): Promise<{ parsed: Stage1UserProfile, input: any }> => {
  const STEP = 'Stage1-UserProfile';
  onLog(`[${STEP}] 深度分析用户画像...`);

  // 构建详细的交互摘要
  const interactionSummary = interactions.slice(-30).map(i => ({
    article: {
      title: i.articleContext.title,
      tags: i.articleContext.tags,
      summary: i.articleContext.summary
    },
    behavior: {
      action: i.clicked ? 'CLICKED_AND_VIEWED' : 'SKIPPED_IN_FEED',
      dwell_time_seconds: i.dwellTime,
      scroll_depth_percent: Math.round(i.scrollDepth * 100),
      liked: i.liked,
      favorited: i.favorited,
      comment: i.comment || null
    }
  }));

  const inputData = {
    interaction_history: interactionSummary,
    candidate_count: preliminaryCandidates.length,
    round_index: roundIndex
  };

  // 组合系统 prompt + 用户可配置 prompt + 上下文数据
  const userPrompt = customPrompt || STAGE1_DEFAULT_USER_PROMPT;
  const contextData = `
【当前上下文数据】

**用户交互历史（最近30条，按 Feed 展示顺序）：**
${JSON.stringify(interactionSummary, null, 2)}

**规则召回的候选池：**
- 候选数量：${preliminaryCandidates.length} 篇
- 候选标签分布：${getTagDistribution(preliminaryCandidates)}

**当前轮次：** 第 ${roundIndex} 刷（${roundIndex === 0 ? '冷启动' : '常规推荐'}）

请根据以上数据，输出符合 JSON Schema 的结构化用户画像分析。`;

  const fullPrompt = STAGE1_SYSTEM_PROMPT + "\n\n" + userPrompt + "\n\n" + contextData;

  onUpdate({
    unified_pipeline: {
      stage1_input: inputData,
      stage1_prompt: fullPrompt
    }
  });

  try {
    onLog(`[${STEP}] 发送请求到 ${modelName}...`);
    const ai = getClient();
    const startTime = Date.now();

    const response = await ai.models.generateContent({
      model: modelName,
      contents: fullPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["interest_hierarchy", "content_preferences", "exploration_tendency", "interest_evolution", "search_decision"],
          properties: {
            interest_hierarchy: {
              type: Type.OBJECT,
              required: ["core", "edge", "potential"],
              properties: {
                core: { type: Type.ARRAY, items: { type: Type.STRING } },
                edge: { type: Type.ARRAY, items: { type: Type.STRING } },
                potential: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            },
            content_preferences: {
              type: Type.OBJECT,
              required: ["depth", "style", "length"],
              properties: {
                depth: { type: Type.STRING },
                style: { type: Type.ARRAY, items: { type: Type.STRING } },
                length: { type: Type.STRING }
              }
            },
            exploration_tendency: { type: Type.NUMBER },
            interest_evolution: { type: Type.STRING },
            search_decision: {
              type: Type.OBJECT,
              required: ["need_search", "reasoning"],
              properties: {
                need_search: { type: Type.BOOLEAN },
                reasoning: { type: Type.STRING },
                keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                articles_per_keyword: { type: Type.NUMBER }
              }
            }
          }
        }
      }
    });

    const duration = (Date.now() - startTime) / 1000;
    onLog(`[${STEP}] 响应接收完成，耗时 ${duration}s`);

    if (!response.text) throw new Error("响应为空");
    const parsed = JSON.parse(response.text) as Stage1UserProfile;

    // 日志输出
    onLog(`[${STEP}] 核心兴趣: ${parsed.interest_hierarchy.core.join(', ')}`);
    onLog(`[${STEP}] 边缘兴趣: ${parsed.interest_hierarchy.edge.join(', ')}`);
    onLog(`[${STEP}] 潜在兴趣: ${parsed.interest_hierarchy.potential.join(', ')}`);
    onLog(`[${STEP}] 探索倾向: ${parsed.exploration_tendency}`);
    onLog(`[${STEP}] 需要搜索: ${parsed.search_decision.need_search ? '是' : '否'}`);
    if (parsed.search_decision.need_search && parsed.search_decision.keywords) {
      onLog(`[${STEP}] 搜索关键词: ${parsed.search_decision.keywords.join(', ')}`);
    }

    onUpdate({ unified_pipeline: { stage1_output: parsed } });
    return { parsed, input: inputData };
  } catch (error: any) {
    onLog(`[${STEP}] 错误: ${error.message}`);
    throw error;
  }
};

// 辅助函数：统计标签分布
const getTagDistribution = (candidates: Array<{ tags: string[] }>): string => {
  const tagCount = new Map<string, number>();
  candidates.forEach(c => {
    (c.tags || []).forEach(tag => {
      tagCount.set(tag, (tagCount.get(tag) || 0) + 1);
    });
  });
  const sorted = Array.from(tagCount.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  return sorted.map(([tag, count]) => `${tag}(${count})`).join(', ');
};

// ==========================================
// 阶段 2: 多通道召回
// ==========================================
export const multiChannelRecall = async (
  userProfile: Stage1UserProfile,
  allArticles: Article[],
  viewedArticleIds: Set<string>,
  config: { core_ratio: number; edge_ratio: number; hot_ratio: number; explore_ratio: number },
  modelName: string,
  customPrompt: string | undefined,
  onLog: LogCallback,
  onUpdate: UpdateCallback
): Promise<{ parsed: Stage2RecallResult, input: any }> => {
  const STEP = 'Stage2-Recall';
  onLog(`[${STEP}] 多通道召回：从 ${allArticles.length} 篇内容中召回...`);

  // 过滤已看过的内容
  const availableArticles = allArticles.filter(a => !viewedArticleIds.has(a.id));
  onLog(`[${STEP}] 排除已看内容后剩余 ${availableArticles.length} 篇`);

  // 构建候选元数据
  const candidatesMeta = availableArticles.map(a => ({
    id: a.id,
    title: a.title,
    tags: a.tag_list || [],
    liked_count: parseInt(a.liked_count || '0') || 0,
    created_at: a.created_at
  }));

  // 计算平均点赞数用于热门判断
  const avgLikes = candidatesMeta.reduce((sum, a) => sum + a.liked_count, 0) / candidatesMeta.length || 1;

  const inputData = {
    user_profile: userProfile,
    total_available: availableArticles.length,
    channel_ratios: config,
    avg_likes: avgLikes
  };

  // 组合 prompt
  const userPrompt = customPrompt || STAGE2_DEFAULT_USER_PROMPT;
  const contextData = `
【当前上下文数据】

**用户兴趣层次：**
- 核心兴趣：${userProfile.interest_hierarchy.core.join(', ')}
- 边缘兴趣：${userProfile.interest_hierarchy.edge.join(', ')}
- 潜在兴趣：${userProfile.interest_hierarchy.potential.join(', ')}

**内容偏好：**
- 深度偏好：${userProfile.content_preferences.depth}
- 风格偏好：${userProfile.content_preferences.style.join(', ')}
- 长度偏好：${userProfile.content_preferences.length}

**探索倾向：** ${userProfile.exploration_tendency}

**通道配比：**
- 核心兴趣通道：${Math.round(config.core_ratio * 100)}%
- 边缘兴趣通道：${Math.round(config.edge_ratio * 100)}%
- 热门内容通道：${Math.round(config.hot_ratio * 100)}%
- 探索发现通道：${Math.round(config.explore_ratio * 100)}%

**候选内容池（${availableArticles.length} 篇）：**
${JSON.stringify(candidatesMeta.slice(0, 300), null, 2)}
${candidatesMeta.length > 300 ? `\n...(还有 ${candidatesMeta.length - 300} 篇，已省略)` : ''}

**热门标准：** 点赞数 > ${Math.round(avgLikes * 2)}（平均值的2倍）

请为每个通道独立召回内容，确保各通道内容不重叠。`;

  const fullPrompt = STAGE2_SYSTEM_PROMPT + "\n\n" + userPrompt + "\n\n" + contextData;

  onUpdate({
    unified_pipeline: {
      stage2_input: inputData,
      stage2_prompt: fullPrompt
    }
  });

  try {
    const ai = getClient();
    const startTime = Date.now();

    const response = await ai.models.generateContent({
      model: modelName,
      contents: fullPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["channels", "total_recalled", "reasoning"],
          properties: {
            channels: {
              type: Type.OBJECT,
              required: ["core", "edge", "hot", "explore"],
              properties: {
                core: { type: Type.ARRAY, items: { type: Type.STRING } },
                edge: { type: Type.ARRAY, items: { type: Type.STRING } },
                hot: { type: Type.ARRAY, items: { type: Type.STRING } },
                explore: { type: Type.ARRAY, items: { type: Type.STRING } }
              }
            },
            total_recalled: { type: Type.NUMBER },
            reasoning: { type: Type.STRING }
          }
        }
      }
    });

    const duration = (Date.now() - startTime) / 1000;
    onLog(`[${STEP}] 响应接收完成，耗时 ${duration}s`);

    if (!response.text) throw new Error("响应为空");
    const parsed = JSON.parse(response.text) as Stage2RecallResult;

    // 日志输出
    onLog(`[${STEP}] 核心通道召回: ${parsed.channels.core.length} 篇`);
    onLog(`[${STEP}] 边缘通道召回: ${parsed.channels.edge.length} 篇`);
    onLog(`[${STEP}] 热门通道召回: ${parsed.channels.hot.length} 篇`);
    onLog(`[${STEP}] 探索通道召回: ${parsed.channels.explore.length} 篇`);
    onLog(`[${STEP}] 总计召回: ${parsed.total_recalled} 篇`);

    onUpdate({ unified_pipeline: { stage2_output: parsed } });
    return { parsed, input: inputData };
  } catch (error: any) {
    onLog(`[${STEP}] 错误: ${error.message}`);
    throw error;
  }
};

// ==========================================
// 阶段 3: 质量过滤
// ==========================================
export const qualityFilter = async (
  userProfile: Stage1UserProfile,
  candidates: Article[],
  viewedArticleIds: Set<string>,
  modelName: string,
  customPrompt: string | undefined,
  onLog: LogCallback,
  onUpdate: UpdateCallback
): Promise<{ parsed: Stage3FilterResult, input: any }> => {
  const STEP = 'Stage3-Filter';
  onLog(`[${STEP}] 质量过滤：评估 ${candidates.length} 篇内容质量...`);

  // 构建候选详情（包含完整内容用于质量评估）
  const candidatesWithContent = candidates.map(a => ({
    id: a.id,
    title: a.title,
    content: (a.desc || '').slice(0, 500), // 限制长度避免 token 过多
    tags: a.tag_list || [],
    liked_count: parseInt(a.liked_count || '0') || 0,
    created_at: a.created_at,
    already_viewed: viewedArticleIds.has(a.id)
  }));

  const inputData = {
    user_profile: userProfile,
    candidates_count: candidates.length
  };

  // 组合 prompt
  const userPrompt = customPrompt || STAGE3_DEFAULT_USER_PROMPT;
  const contextData = `
【当前上下文数据】

**用户兴趣层次：**
- 核心兴趣：${userProfile.interest_hierarchy.core.join(', ')}
- 边缘兴趣：${userProfile.interest_hierarchy.edge.join(', ')}
- 潜在兴趣：${userProfile.interest_hierarchy.potential.join(', ')}

**内容偏好：**
- 深度偏好：${userProfile.content_preferences.depth}
- 风格偏好：${userProfile.content_preferences.style.join(', ')}
- 长度偏好：${userProfile.content_preferences.length}

**待过滤的候选内容（${candidates.length} 篇）：**
${JSON.stringify(candidatesWithContent, null, 2)}

请对每篇内容进行质量评估，过滤低质量内容，并输出通过筛选的文章列表和评分明细。`;

  const fullPrompt = STAGE3_SYSTEM_PROMPT + "\n\n" + userPrompt + "\n\n" + contextData;

  onUpdate({
    unified_pipeline: {
      stage3_input: inputData,
      stage3_prompt: fullPrompt
    }
  });

  try {
    const ai = getClient();
    const startTime = Date.now();

    const response = await ai.models.generateContent({
      model: modelName,
      contents: fullPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["passed_ids", "filtered_out", "quality_scores"],
          properties: {
            passed_ids: { type: Type.ARRAY, items: { type: Type.STRING } },
            filtered_out: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["id", "reason"],
                properties: {
                  id: { type: Type.STRING },
                  reason: { type: Type.STRING }
                }
              }
            },
            quality_scores: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["id", "score", "breakdown"],
                properties: {
                  id: { type: Type.STRING },
                  score: { type: Type.NUMBER },
                  breakdown: {
                    type: Type.OBJECT,
                    required: ["content_quality", "relevance", "freshness"],
                    properties: {
                      content_quality: { type: Type.NUMBER },
                      relevance: { type: Type.NUMBER },
                      freshness: { type: Type.NUMBER }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const duration = (Date.now() - startTime) / 1000;
    onLog(`[${STEP}] 响应接收完成，耗时 ${duration}s`);

    if (!response.text) throw new Error("响应为空");
    const parsed = JSON.parse(response.text) as Stage3FilterResult;

    // 日志输出
    onLog(`[${STEP}] 通过筛选: ${parsed.passed_ids.length} 篇`);
    onLog(`[${STEP}] 被过滤: ${parsed.filtered_out.length} 篇`);

    // 统计过滤原因
    const reasonCounts = new Map<string, number>();
    parsed.filtered_out.forEach(f => {
      reasonCounts.set(f.reason, (reasonCounts.get(f.reason) || 0) + 1);
    });
    reasonCounts.forEach((count, reason) => {
      onLog(`[${STEP}] - ${reason}: ${count} 篇`);
    });

    onUpdate({ unified_pipeline: { stage3_output: parsed } });
    return { parsed, input: inputData };
  } catch (error: any) {
    onLog(`[${STEP}] 错误: ${error.message}`);
    throw error;
  }
};

// ==========================================
// 阶段 4: 精排 + 多样性优化
// ==========================================
export const finalRanking = async (
  userProfile: Stage1UserProfile,
  candidates: Article[],
  qualityScores: Stage3FilterResult['quality_scores'],
  finalCount: number,
  minUniqueTags: number,
  modelName: string,
  customPrompt: string | undefined,
  onLog: LogCallback,
  onUpdate: UpdateCallback
): Promise<{ parsed: Stage4RankResult, input: any }> => {
  const STEP = 'Stage4-Rank';
  onLog(`[${STEP}] 精排：从 ${candidates.length} 篇中选出最终 ${finalCount} 篇...`);

  // 构建候选详情（包含质量评分）
  const scoreMap = new Map(qualityScores.map(s => [s.id, s]));
  const candidatesWithScores = candidates.map(a => {
    const score = scoreMap.get(a.id);
    return {
      id: a.id,
      title: a.title,
      content: (a.desc || '').slice(0, 300),
      tags: a.tag_list || [],
      quality_score: score?.score || 0.5,
      score_breakdown: score?.breakdown || { content_quality: 0.5, relevance: 0.5, freshness: 0.5 }
    };
  });

  const inputData = {
    user_profile: userProfile,
    candidates_count: candidates.length,
    final_count: finalCount,
    min_unique_tags: minUniqueTags
  };

  // 组合 prompt
  const userPrompt = customPrompt || STAGE4_DEFAULT_USER_PROMPT;
  const contextData = `
【当前上下文数据】

**用户兴趣层次：**
- 核心兴趣：${userProfile.interest_hierarchy.core.join(', ')}
- 边缘兴趣：${userProfile.interest_hierarchy.edge.join(', ')}
- 潜在兴趣：${userProfile.interest_hierarchy.potential.join(', ')}

**内容偏好：**
- 深度偏好：${userProfile.content_preferences.depth}
- 风格偏好：${userProfile.content_preferences.style.join(', ')}
- 长度偏好：${userProfile.content_preferences.length}

**探索倾向：** ${userProfile.exploration_tendency}

**候选内容及质量评分（${candidates.length} 篇）：**
${JSON.stringify(candidatesWithScores, null, 2)}

**输出要求：**
- 最终推荐 ${finalCount} 篇
- 至少覆盖 ${minUniqueTags} 个不同标签
- 按位置策略分配槽位（core/edge/explore）

请执行精排，输出最终推荐列表。`;

  const fullPrompt = STAGE4_SYSTEM_PROMPT + "\n\n" + userPrompt + "\n\n" + contextData;

  onUpdate({
    unified_pipeline: {
      stage4_input: inputData,
      stage4_prompt: fullPrompt
    }
  });

  try {
    const ai = getClient();
    const startTime = Date.now();

    const response = await ai.models.generateContent({
      model: modelName,
      contents: fullPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["recommendations", "diversity_metrics"],
          properties: {
            recommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["id", "rank", "slot_type", "reasoning", "scores"],
                properties: {
                  id: { type: Type.STRING },
                  rank: { type: Type.NUMBER },
                  slot_type: { type: Type.STRING },
                  reasoning: { type: Type.STRING },
                  scores: {
                    type: Type.OBJECT,
                    required: ["relevance", "diversity", "final"],
                    properties: {
                      relevance: { type: Type.NUMBER },
                      diversity: { type: Type.NUMBER },
                      final: { type: Type.NUMBER }
                    }
                  }
                }
              }
            },
            diversity_metrics: {
              type: Type.OBJECT,
              required: ["unique_tags", "category_distribution"],
              properties: {
                unique_tags: { type: Type.NUMBER },
                category_distribution: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    required: ["category", "count"],
                    properties: {
                      category: { type: Type.STRING },
                      count: { type: Type.NUMBER }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const duration = (Date.now() - startTime) / 1000;
    onLog(`[${STEP}] 响应接收完成，耗时 ${duration}s`);

    if (!response.text) throw new Error("响应为空");
    const parsed = JSON.parse(response.text) as Stage4RankResult;

    // 日志输出
    onLog(`[${STEP}] 精排完成，最终推荐 ${parsed.recommendations.length} 篇`);
    parsed.recommendations.forEach(r => {
      onLog(`[${STEP}] #${r.rank} [${r.slot_type}]: ${r.reasoning.slice(0, 40)}...`);
    });
    onLog(`[${STEP}] 多样性: ${parsed.diversity_metrics.unique_tags} 个不同标签`);

    onUpdate({ unified_pipeline: { stage4_output: parsed } });
    return { parsed, input: inputData };
  } catch (error: any) {
    onLog(`[${STEP}] 错误: ${error.message}`);
    throw error;
  }
};

// ==========================================
// 统一推荐流程编排器（四阶段重构版）
// ==========================================

export const runUnifiedRecommendationPipeline = async (
  interactions: Interaction[],
  modelName: string,
  roundIndex: number,
  onLog: LogCallback,
  onUpdate: UpdateCallback,
  contextUserId?: string,
  contextExpId?: string,
  experimentMode?: 'solo' | 'community',
  onSearchNeeded?: (keywords: string[], articlesPerKeyword: number) => Promise<void>,
  sessions?: GeneratedContentBatch[],
  experiment?: Experiment  // 用于获取自定义 prompt 配置
): Promise<UnifiedRecommendationResult> => {
  onLog('[UnifiedPipeline] 启动四阶段推荐流程...');
  const logBuffer: string[] = [];
  const captureLog = (msg: string) => { logBuffer.push(msg); onLog(msg); };

  const userId = interactions.length > 0 ? interactions[0].userId : contextUserId;
  if (!userId) throw new Error("No user context.");

  const expId = interactions.length > 0 ? interactions[0].experimentId : contextExpId;
  if (!expId) throw new Error("No experiment context.");

  // 获取推荐配置
  const config = experiment?.recommendation_config || DEFAULT_RECOMMENDATION_CONFIG;
  captureLog(`[Pipeline] 配置: core=${config.core_ratio}, edge=${config.edge_ratio}, hot=${config.hot_ratio}, explore=${config.explore_ratio}`);

  // 根据 Feed 展示顺序排列交互
  const sortInteractionsByFeedOrder = (interactions: Interaction[], sessions?: GeneratedContentBatch[]) => {
    if (!sessions || sessions.length === 0) {
      return [...interactions].sort((a, b) => {
        if (a.sessionId !== b.sessionId) {
          return a.sessionId.localeCompare(b.sessionId);
        }
        return a.timestamp - b.timestamp;
      });
    }

    const sessionOrderMap = new Map<string, string[]>();
    sessions.forEach(s => {
      sessionOrderMap.set(s.sessionId, s.articles.map(a => a.id));
    });

    const interactionsBySession = new Map<string, Interaction[]>();
    interactions.forEach(i => {
      if (!interactionsBySession.has(i.sessionId)) {
        interactionsBySession.set(i.sessionId, []);
      }
      interactionsBySession.get(i.sessionId)?.push(i);
    });

    const sortedInteractions: Interaction[] = [];
    sessions.forEach(session => {
      const sessionInts = interactionsBySession.get(session.sessionId);
      if (!sessionInts || sessionInts.length === 0) return;

      const orderList = sessionOrderMap.get(session.sessionId) || [];
      sessionInts.sort((a, b) => {
        const idxA = orderList.indexOf(a.articleId);
        const idxB = orderList.indexOf(b.articleId);
        if (idxA === -1 && idxB === -1) return a.timestamp - b.timestamp;
        if (idxA === -1) return 1;
        if (idxB === -1) return -1;
        return idxA - idxB;
      });

      sortedInteractions.push(...sessionInts);
    });

    return sortedInteractions;
  };

  const sortedInteractions = sortInteractionsByFeedOrder(interactions, sessions);

  // 构建已展示过的文章 ID 集合（从 sessions 中获取所有展示过的文章，不仅仅是点击过的）
  const displayedArticleIds = new Set<string>(
    sessions?.flatMap(s => s.articles.map(a => a.id)) || []
  );
  // 备用：如果没有 session 数据，使用交互数据
  if (displayedArticleIds.size === 0) {
    interactions.forEach(i => displayedArticleIds.add(i.articleId));
  }
  captureLog(`[Pipeline] 用户已看过 ${displayedArticleIds.size} 篇内容（来自 ${sessions?.length || 0} 个 session）`);

  // 初始化 unified_pipeline 追踪对象
  const unifiedPipelineDebug: any = {};
  const captureUpdate = (data: any) => {
    if (data.unified_pipeline) {
      Object.assign(unifiedPipelineDebug, data.unified_pipeline);
    }
    onUpdate({
      rawInteractions: sortedInteractions,
      unified_pipeline: unifiedPipelineDebug
    });
  };

  onUpdate({ rawInteractions: sortedInteractions });

  try {
    // ========== 获取内容库 ==========
    captureLog('[Pipeline] 获取内容库...');
    const libraryType = experimentMode === 'solo' ? 'personal' : experimentMode === 'community' ? 'community' : undefined;

    let allArticles: Article[];
    if (libraryType === 'personal') {
      allArticles = await db.getPersonalLibrary(userId!, expId!);
      captureLog(`[Pipeline] Solo 模式: 从实验 ${expId} 的个人库获取内容`);
    } else if (libraryType === 'community') {
      allArticles = await db.getCommunityLibrary();
      captureLog(`[Pipeline] Community 模式: 从社区库获取内容`);
    } else {
      allArticles = await db.getAllArticles();
    }
    captureLog(`[Pipeline] 库大小: ${allArticles.length} 篇`);

    // ========== 预处理: 规则召回候选集 ==========
    captureLog('[Pipeline] 预处理: 规则召回候选集...');
    const recentInteractions = sortedInteractions.slice(-20);
    const interestTags = new Set<string>();

    recentInteractions.forEach(i => {
      const tags = i.articleContext.tags || [];
      tags.forEach(tag => interestTags.add(tag));
    });

    captureLog(`[Pipeline] 从交互历史提取到 ${interestTags.size} 个兴趣标签`);

    let preliminaryCandidates: Article[] = [];
    if (interestTags.size > 0) {
      preliminaryCandidates = allArticles.filter(a => {
        const articleTags = a.tag_list || [];
        const tagOverlap = articleTags.filter(tag =>
          Array.from(interestTags).some(interest =>
            tag.includes(interest) || interest.includes(tag)
          )
        );
        return tagOverlap.length >= 1;
      });
    }

    if (preliminaryCandidates.length < 100) {
      captureLog(`[Pipeline] 规则召回仅 ${preliminaryCandidates.length} 篇，补充最新内容...`);
      const recentArticles = allArticles
        .sort((a, b) => (b.created_at || 0) - (a.created_at || 0))
        .slice(0, 200);

      const existingIds = new Set(preliminaryCandidates.map(a => a.id));
      const additionalArticles = recentArticles.filter(a => !existingIds.has(a.id));
      preliminaryCandidates = [...preliminaryCandidates, ...additionalArticles].slice(0, 200);
    }

    captureLog(`[Pipeline] 规则召回完成: ${preliminaryCandidates.length} 篇候选`);

    const candidatesMeta = preliminaryCandidates.map(a => ({
      id: a.id,
      title: a.title,
      tags: a.tag_list || []
    }));

    // ========== 阶段 1: 用户画像深度分析 ==========
    captureLog('[Pipeline] ========== 阶段 1: 用户画像分析 ==========');
    const stage1 = await analyzeUserProfile(
      sortedInteractions,
      candidatesMeta,
      roundIndex,
      modelName,
      experiment?.stage1_custom_prompt,
      captureLog,
      captureUpdate
    );

    // 如果需要搜索，执行搜索
    if (stage1.parsed.search_decision.need_search && onSearchNeeded) {
      const keywords = stage1.parsed.search_decision.keywords || [];
      const articlesPerKeyword = stage1.parsed.search_decision.articles_per_keyword || 3;

      captureLog(`[Pipeline] 执行搜索: ${keywords.length} 个关键词...`);
      await onSearchNeeded(keywords, articlesPerKeyword);
      captureLog('[Pipeline] 搜索完成，内容已入库');

      // 重新获取更新后的文章列表
      if (libraryType === 'personal') {
        allArticles = await db.getPersonalLibrary(userId!, expId!);
      } else if (libraryType === 'community') {
        allArticles = await db.getCommunityLibrary();
      } else {
        allArticles = await db.getAllArticles();
      }
      captureLog(`[Pipeline] 更新后的库大小: ${allArticles.length} 篇`);
    }

    // ========== 阶段 2: 多通道召回 ==========
    captureLog('[Pipeline] ========== 阶段 2: 多通道召回 ==========');
    const stage2 = await multiChannelRecall(
      stage1.parsed,
      allArticles,
      displayedArticleIds,
      config,
      modelName,
      experiment?.stage2_custom_prompt,
      captureLog,
      captureUpdate
    );

    // 合并所有通道的召回结果
    const allRecalledIds = [
      ...stage2.parsed.channels.core,
      ...stage2.parsed.channels.edge,
      ...stage2.parsed.channels.hot,
      ...stage2.parsed.channels.explore
    ];
    const uniqueRecalledIds = [...new Set(allRecalledIds)];
    captureLog(`[Pipeline] 召回去重后共 ${uniqueRecalledIds.length} 篇`);

    const recalledArticles = await db.getArticlesByIds(uniqueRecalledIds);
    captureLog(`[Pipeline] 实际获取到 ${recalledArticles.length} 篇文章`);

    // ========== 阶段 3: 质量过滤 ==========
    captureLog('[Pipeline] ========== 阶段 3: 质量过滤 ==========');
    const stage3 = await qualityFilter(
      stage1.parsed,
      recalledArticles,
      displayedArticleIds,
      modelName,
      experiment?.stage3_custom_prompt,
      captureLog,
      captureUpdate
    );

    // 获取通过质量过滤的文章
    const passedArticles = await db.getArticlesByIds(stage3.parsed.passed_ids);
    captureLog(`[Pipeline] 质量过滤后剩余 ${passedArticles.length} 篇`);

    // ========== 阶段 4: 精排 + 多样性优化 ==========
    captureLog('[Pipeline] ========== 阶段 4: 精排 + 多样性 ==========');
    const stage4 = await finalRanking(
      stage1.parsed,
      passedArticles,
      stage3.parsed.quality_scores,
      config.final_count,
      config.min_unique_tags,
      modelName,
      experiment?.stage4_custom_prompt,
      captureLog,
      captureUpdate
    );

    // ========== 获取最终文章 ==========
    const finalIds = stage4.parsed.recommendations
      .sort((a, b) => a.rank - b.rank)
      .map(r => r.id);

    const finalArticles = await db.getArticlesByIds(finalIds);

    // 按照 rank 排序
    const sortedArticles = finalIds
      .map(id => finalArticles.find(a => a.id === id))
      .filter(a => a !== undefined) as Article[];

    captureLog(`[UnifiedPipeline] 四阶段流程完成，最终推荐 ${sortedArticles.length} 篇文章`);

    // 输出多样性统计
    const uniqueTags = new Set<string>();
    sortedArticles.forEach(a => {
      (a.tag_list || []).forEach(tag => uniqueTags.add(tag));
    });
    captureLog(`[UnifiedPipeline] 推荐多样性: ${uniqueTags.size} 个不同标签`);

    return {
      stage1_profile: stage1.parsed,
      stage2_recall: stage2.parsed,
      stage3_coarse: stage3.parsed,
      stage4_fine: stage4.parsed,
      final_articles: sortedArticles,
      debug: {
        logs: logBuffer,
        rawInteractions: sortedInteractions,
        unified_pipeline: unifiedPipelineDebug
      }
    };
  } catch (error: any) {
    captureLog(`[UnifiedPipeline] 错误: ${error.message}`);
    throw error;
  }
};