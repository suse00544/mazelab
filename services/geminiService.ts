import { GoogleGenAI, Type } from "@google/genai";
import { Interaction, RecommendationStrategy, RecommendationResponse, Article, DebugInfo, CandidateItem, GeneratedContentBatch } from "../types";
import { db } from "./db";

const getClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key missing");
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
const buildEvolutionaryLog = (interactions: Interaction[], allSessions: GeneratedContentBatch[], allArticles: Article[]) => {
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
                category: i.articleContext.category,
                tags: i.articleContext.tags,
                content_summary_for_context: article?.summary || "No summary available"
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

  return processedSessions.slice(-3);
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
    onUpdate: UpdateCallback
) => {
  onLog('[Pipeline] Starting...');
  const logBuffer: string[] = [];
  const captureLog = (msg: string) => { logBuffer.push(msg); onLog(msg); };

  const userId = interactions.length > 0 ? interactions[0].userId : null;
  if (!userId) throw new Error("No user context.");

  // 1. Fetch Async Data for Context
  captureLog('[Data] Fetching sessions & articles for history context...');
  const expId = interactions[0].experimentId;
  const [sessions, allArticles] = await Promise.all([
      db.getExperimentSessions(expId),
      db.getAllArticles()
  ]);

  // 2. Build History Logs
  const evolutionaryLogs = buildEvolutionaryLog(interactions, sessions, allArticles);
  onUpdate({ rawInteractions: evolutionaryLogs });

  // 3. Recall
  captureLog('[Recall] Fetching candidates...');
  const candidates = await db.getCandidatesForUser(userId, 50);
  captureLog(`[Recall] Retrieved ${candidates.length} candidates.`);

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