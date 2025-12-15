import { Article, User, Interaction, GeneratedContentBatch, Experiment, CandidateItem } from '../types';
import { DEFAULT_STRATEGY_TASK, DEFAULT_CONTENT_TASK } from './geminiService';

const API_BASE = '/api';

async function api<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: { 'Content-Type': 'application/json' },
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

  saveArticle: (article: Article) => api('/articles', { method: 'POST', body: JSON.stringify(article) }),
  softDeleteArticle: (id: string) => api('/articles/delete', { method: 'POST', body: JSON.stringify({ id }) }),
  restoreArticle: (id: string) => api('/articles/restore', { method: 'POST', body: JSON.stringify({ id }) }),

  // Config
  getGlobalConfig: async () => {
    const res = await api<{strategyPrompt: string, contentPrompt: string}>('/config');
    return {
      strategyPrompt: res.strategyPrompt || DEFAULT_STRATEGY_TASK,
      contentPrompt: res.contentPrompt || DEFAULT_CONTENT_TASK
    };
  },

  saveGlobalConfig: (strategyPrompt: string, contentPrompt: string) => 
    api('/config', { method: 'POST', body: JSON.stringify({ strategyPrompt, contentPrompt }) }),

  // Experiments
  getUserExperiments: (userId: string) => api<Experiment[]>(`/experiments?userId=${userId}`),

  getActiveExperiment: async (userId: string) => {
    const exps = await api<Experiment[]>(`/experiments?userId=${userId}`);
    return exps.find(e => e.active) || null;
  },

  createExperiment: async (userId: string) => {
    const exps = await api<Experiment[]>(`/experiments?userId=${userId}`);
    const expName = `实验 #${exps.length + 1}`;
    const globalConfig = await db.getGlobalConfig();

    const newExp: Experiment = {
      id: `exp-${Date.now()}`,
      userId,
      startTimestamp: Date.now(),
      name: expName,
      active: true,
      customStrategyPrompt: globalConfig.strategyPrompt,
      customContentPrompt: globalConfig.contentPrompt
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
  getCategories: async () => {
      const articles = await api<Article[]>('/articles');
      const cats = new Set(articles.map(a => a.category).filter(Boolean));
      return Array.from(cats);
  },
  
  addCategory: (c: string) => { /* No-op, categories are derived */ },

  getCandidatesForUser: async (userId: string, limit: number = 50) => {
      const all = await api<Article[]>('/articles');
      const publicArts = all.filter(a => a.isPublic && !a.deletedAt);
      const shuffled = publicArts.sort(() => 0.5 - Math.random());
      return shuffled.slice(0, limit).map(a => ({
          id: a.id,
          title: a.title,
          summary: a.summary,
          category: a.category,
          tags: a.tags
      }));
  },

  getArticlesByIds: async (ids: string[]) => {
      const all = await api<Article[]>('/articles');
      return all.filter(a => ids.includes(a.id));
  }
};