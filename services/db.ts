import { Article, User, Interaction, GeneratedContentBatch, Experiment, CandidateItem } from '../types';
import { DEFAULT_STRATEGY_TASK, DEFAULT_CONTENT_TASK } from './geminiService';
import { DEFAULT_KEYWORD_COLD_START_TASK, DEFAULT_KEYWORD_INTERACTION_TASK } from './autoCrawlService';

const API_BASE = '/api';

async function api<T>(endpoint: string, options?: RequestInit): Promise<T> {
    // Add cache-busting for GET requests to prevent stale data
    const separator = endpoint.includes('?') ? '&' : '?';
    const cacheBuster = options?.method && options.method !== 'GET' ? '' : `${separator}_t=${Date.now()}`;
    const url = `${API_BASE}${endpoint}${cacheBuster}`;

    const res = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        ...options
    });
    if (!res.ok) {
        throw new Error(`API Error ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
}

export const PREDEFINED_USERS: User[] = [
  { id: 'u_xiuchuan', username: '秀川', gender: 'male', avatar: 'https://api.dicebear.com/7.x/micah/svg?seed=Felix&baseColor=f9c9b6&hair=dannyPhantom&mouth=smile', created_at: 0 },
  { id: 'u_bob', username: 'Bob', gender: 'male', avatar: 'https://api.dicebear.com/7.x/micah/svg?seed=Bob&baseColor=acacac&hair=fonze&mouth=smile', created_at: 0 },
  { id: 'u_alu', username: '阿盧', gender: 'female', avatar: 'https://api.dicebear.com/7.x/micah/svg?seed=Willow&baseColor=f9c9b6&hair=pixie&mouth=pucker', created_at: 0 },
  { id: 'u_olivia', username: 'Olivia', gender: 'female', avatar: 'https://api.dicebear.com/7.x/micah/svg?seed=Annie&baseColor=f9c9b6&hair=full&mouth=laughing', created_at: 0 },
  { id: 'u_chain', username: 'Chain', gender: 'male', avatar: 'https://api.dicebear.com/7.x/micah/svg?seed=Oliver&baseColor=acacac&hair=turban&mouth=smirk', created_at: 0 },
  { id: 'u_jennifer', username: 'Jennifer', gender: 'female', avatar: 'https://ui-avatars.com/api/?name=Jennifer&background=random&color=fff&bold=true', created_at: 0 },
];

export const db = {
  getUsers: (): User[] => PREDEFINED_USERS,

  // Articles
  getAllArticles: () => api<Article[]>('/articles'),

  getPublicArticles: async () => {
    const all = await api<Article[]>('/articles');
    return all.filter(a => a.isPublic && !a.deletedAt);
  },

  getRecycledArticles: async () => {
    const all = await api<Article[]>('/articles');
    return all.filter(a => a.deletedAt);
  },

  // 获取个人库（指定用户的 personal library）
  // 获取个人库（实验独立）
  getPersonalLibrary: async (userId: string, experimentId?: string) => {
    if (experimentId) {
      return api<Article[]>(`/articles?library_type=personal&owner_id=${userId}&experiment_id=${experimentId}`);
    }
    return api<Article[]>(`/articles?library_type=personal&owner_id=${userId}`);
  },

  // 清空个人库（实验独立）
  clearPersonalLibrary: async (userId: string, experimentId: string) => {
    return api('/articles/clear-personal', {
      method: 'POST',
      body: JSON.stringify({ userId, experimentId })
    });
  },

  // 获取社区库（所有 community library 内容）
  getCommunityLibrary: async () => {
    return api<Article[]>('/articles?library_type=community');
  },

  // 获取社区库（按贡献者过滤）
  getCommunityLibraryByContributor: async (contributorId: string) => {
    return api<Article[]>(`/articles?library_type=community&contributor=${contributorId}`);
  },

  saveArticle: (article: Article) => api('/articles', { method: 'POST', body: JSON.stringify(article) }),
  softDeleteArticle: (id: string) => api('/articles/delete', { method: 'POST', body: JSON.stringify({ id }) }),
  restoreArticle: (id: string) => api('/articles/restore', { method: 'POST', body: JSON.stringify({ id }) }),

  // Config
  getGlobalConfig: async () => {
    const res = await api<{
      strategyPrompt: string,
      contentPrompt: string,
      keywordColdStartPrompt?: string,
      keywordInteractionPrompt?: string
    }>('/config');
    return {
      strategyPrompt: res.strategyPrompt || DEFAULT_STRATEGY_TASK,
      contentPrompt: res.contentPrompt || DEFAULT_CONTENT_TASK,
      keywordColdStartPrompt: res.keywordColdStartPrompt || DEFAULT_KEYWORD_COLD_START_TASK,
      keywordInteractionPrompt: res.keywordInteractionPrompt || DEFAULT_KEYWORD_INTERACTION_TASK
    };
  },

  saveGlobalConfig: (
    strategyPrompt: string,
    contentPrompt: string,
    keywordColdStartPrompt?: string,
    keywordInteractionPrompt?: string
  ) =>
    api('/config', { method: 'POST', body: JSON.stringify({
      strategyPrompt,
      contentPrompt,
      keywordColdStartPrompt,
      keywordInteractionPrompt
    }) }),

  // Experiments
  getUserExperiments: (userId: string) => api<Experiment[]>(`/experiments?userId=${userId}`),

  getActiveExperiment: async (userId: string) => {
    const exps = await api<Experiment[]>(`/experiments?userId=${userId}`);
    return exps.find(e => e.active) || null;
  },

  createExperiment: async (
    userId: string,
    config?: {
      name?: string;
      mode?: 'solo' | 'community';
    }
  ) => {
    const exps = await api<Experiment[]>(`/experiments?userId=${userId}`);
    const expName = config?.name || `实验 #${exps.length + 1}`;
    const globalConfig = await db.getGlobalConfig();

    const newExp: Experiment = {
      id: `exp-${Date.now()}`,
      userId,
      startTimestamp: Date.now(),
      name: expName,
      active: true,
      mode: config?.mode || 'solo',
      customKeywordColdStartPrompt: globalConfig.keywordColdStartPrompt,
      customKeywordInteractionPrompt: globalConfig.keywordInteractionPrompt
    };

    await api('/experiments', { method: 'POST', body: JSON.stringify(newExp) });
    return { experiment: newExp, initialSessionId: '' };
  },

  activateExperiment: async (expId: string, userId: string) => {
     const exps = await api<Experiment[]>(`/experiments?userId=${userId}`);
     const target = exps.find(e => e.id === expId);
     if(target) {
         target.active = true;
         await api('/experiments', { method: 'POST', body: JSON.stringify(target) });
     }
  },

  // 删除实验（同时删除关联的个人库文章、会话、交互记录）
  deleteExperiment: async (expId: string) => {
    return api(`/experiments/${expId}`, { method: 'DELETE' });
  },

  // 更新实验配置（支持四阶段 prompt 和推荐参数）
  updateExperiment: async (expId: string, updates: Partial<Experiment>) => {
    // 先获取当前实验数据
    const exps = await api<Experiment[]>(`/experiments`);
    const target = exps.find(e => e.id === expId);
    if (!target) {
      throw new Error(`Experiment ${expId} not found`);
    }

    // 合并更新
    const updatedExp = { ...target, ...updates };

    // 保存更新后的实验
    await api('/experiments', { method: 'POST', body: JSON.stringify(updatedExp) });
    return updatedExp;
  },

  updateExperimentConfig: async (expId: string, strategy: string, content: string) => {
     // For now, this requires the full experiment object.
     // We will rely on the UI passing full object updates via saveExperiment logic if needed.
     // Or we implement a fetch-update loop here.
     // Simplified: We assume UI handles it.
  },

  // Interactions
  getExperimentInteractions: (experimentId: string) => api<Interaction[]>(`/interactions?experimentId=${experimentId}`),
  saveInteraction: (interaction: Interaction) => api('/interactions', { method: 'POST', body: JSON.stringify(interaction) }),

  // Sessions
  getExperimentSessions: (experimentId: string) => api<GeneratedContentBatch[]>(`/sessions?experimentId=${experimentId}`),
  saveRecommendationSession: (session: GeneratedContentBatch) => api('/sessions', { method: 'POST', body: JSON.stringify(session) }),

  // User Seeds
  getUserSeedConfig: (userId: string) => api<string[]>(`/user_seeds?userId=${userId}`),
  updateUserSeedConfig: (userId: string, articleIds: string[]) => api('/user_seeds', { method: 'POST', body: JSON.stringify({ userId, articleIds }) }),

  // Helpers
  // getCategories 已移除（小红书没有 category 字段，只使用 tags）

  getCandidatesForUser: async (userId: string, limit: number = 50, libraryType?: 'personal' | 'community', experimentId?: string) => {
      let all: Article[];

      if (libraryType === 'personal') {
          // 从个人库获取候选内容（需要 experimentId）
          if (experimentId) {
              all = await api<Article[]>(`/articles?library_type=personal&owner_id=${userId}&experiment_id=${experimentId}`);
          } else {
              all = await api<Article[]>(`/articles?library_type=personal&owner_id=${userId}`);
          }
      } else if (libraryType === 'community') {
          // 从社区库获取候选内容
          all = await api<Article[]>('/articles?library_type=community');
      } else {
          // 兼容旧代码：从所有公开内容获取
          all = await api<Article[]>('/articles');
      }

      const publicArts = all.filter(a => a.isPublic && !a.deletedAt);
      const shuffled = publicArts.sort(() => 0.5 - Math.random());
      return shuffled.slice(0, limit).map(a => ({
          id: a.id,
          title: a.title,
          content: a.desc || a.content || a.summary || '',  // 使用完整内容（小红书笔记不长）
          tags: a.tag_list || a.tags || []
      }));
  },

  getArticlesByIds: async (ids: string[]) => {
      const all = await api<Article[]>('/articles');
      return all.filter(a => ids.includes(a.id));
  }
};