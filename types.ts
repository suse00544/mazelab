// ==========================================
// 标准化内容 Schema - 所有内容入库必须遵循
// ==========================================
export type ContentSource = 'xhs' | 'jina' | 'manual' | 'generated';
export type ContentStatus = 'active' | 'removed' | 'pending';

export interface ContentAuthor {
  id: string;
  name: string;
  avatar?: string;
}

export interface ContentMedia {
  type: 'image' | 'video';
  url_local: string;      // 本地存储路径 /uploads/xxx
  url_source?: string;    // 原始来源 URL
  width?: number;
  height?: number;
  order: number;          // 顺序索引
}

export interface ContentMetrics {
  likes: number;
  favorites: number;
  comments: number;
  shares: number;
  views?: number;
}

export interface CrawlContext {
  keyword?: string;       // 搜索关键词
  campaign_id?: string;   // 关联的实验/活动 ID
  crawled_at: number;     // 抓取时间
}

// 标准化文章/内容接口
export interface Article {
  id: string;
  
  // 来源信息
  source: ContentSource;
  source_item_id?: string;  // 原平台的 ID（如小红书笔记 ID）
  original_url?: string;    // 原始链接
  
  // 基础内容
  title: string;
  subtitle?: string;
  summary: string;
  content: string;          // Markdown 格式
  content_plain?: string;   // 纯文本格式
  
  // 作者信息
  author?: ContentAuthor;
  
  // 媒体资源
  media?: ContentMedia[];   // 图片/视频列表
  imageUrl?: string;        // 封面图（兼容旧字段）
  
  // 分类标签
  category: string;
  tags: string[];
  topics?: string[];        // 话题标签
  
  // 元数据
  tone: 'Professional' | 'Casual' | 'Humorous' | 'Deep';
  estimatedReadTime: number;
  language?: string;
  
  // 统计数据
  metrics?: ContentMetrics;
  
  // 时间戳
  created_at: number;       // 创建/入库时间
  publish_time?: number;    // 原始发布时间
  
  // 抓取上下文
  crawl_context?: CrawlContext;
  
  // 状态管理
  status: ContentStatus;
  isPublic: boolean;
  ownerId?: string;
  deletedAt?: number;
}

// ==========================================
// 冷启动问卷相关类型
// ==========================================
export interface OnboardingQuestion {
  id: string;
  question: string;
  type: 'single' | 'multiple' | 'text' | 'scale';
  options?: string[];       // 选项（单选/多选时）
  min?: number;             // 量表最小值
  max?: number;             // 量表最大值
  required: boolean;
  order: number;
  category: 'basic' | 'interest' | 'behavior';
}

export interface UserProfile {
  userId: string;
  answers: Record<string, any>;  // 问卷答案
  demographics?: {
    gender?: string;
    age_range?: string;
  };
  interests?: string[];
  recent_topics?: string[];
  created_at: number;
  updated_at: number;
}

// ==========================================
// Trace 日志类型
// ==========================================
export interface TraceStep {
  id: string;
  run_id: string;
  step_name: string;
  status: 'running' | 'completed' | 'failed';
  started_at: number;
  ended_at?: number;
  duration_ms?: number;
  input?: any;
  output?: any;
  error?: string;
}

export interface TraceRun {
  id: string;
  experiment_id?: string;
  user_id: string;
  type: 'onboarding' | 'keyword_generation' | 'content_crawl' | 'recommendation';
  status: 'running' | 'completed' | 'failed';
  started_at: number;
  ended_at?: number;
  steps: TraceStep[];
}

export interface User {
  id: string;
  username: string;
  gender: 'male' | 'female';
  avatar: string; // URL
  created_at: number;
}

export interface Experiment {
  id: string;
  userId: string;
  startTimestamp: number;
  name: string; // e.g. "Experiment 1"
  active: boolean;
  
  // Custom Configuration
  customStrategyPrompt?: string;
  customContentPrompt?: string;
}

// Raw interaction data - NO SCORES
export interface Interaction {
  id: string;
  userId: string;
  articleId: string;
  experimentId: string; // Link to specific experiment
  sessionId: string; // To group recommendation rounds
  
  // Implicit
  clicked: boolean;
  dwellTime: number; // Seconds
  scrollDepth: number; // 0.0 to 1.0
  
  // Explicit
  liked: boolean;
  favorited: boolean;
  comment?: string; // User written comment
  
  timestamp: number;
  
  // Context snapshot for the AI (so it knows what was shown)
  articleContext: {
    title: string;
    category: string;
    tags: string[];
    // difficulty removed
  };
}

export interface RecommendationStrategy {
  user_profile: {
    interests_summary: string;
    behavior_patterns: string;
    engagement_level: string;
  };
  recommendation_strategy: {
    personalization_ratio: number;
    exploration_ratio: number;
    serendipity_ratio: number;
    personalized_approach: string;
    exploration_approach: string;
  };
  detailed_reasoning: {
    why_personalized: string;
    why_exploration: string;
    what_to_avoid: string;
  };
}

export interface DebugInfo {
  logs: string[];
  rawInteractions: any[];
  strategyPrompt: string;
  strategyResponse: any;
  contentPrompt: string;
  contentResponse: any;
}

export interface GeneratedContentBatch {
  sessionId: string;
  experimentId: string; // Linked to experiment
  strategy: RecommendationStrategy;
  articles: Article[];
  timestamp: number;
  roundIndex: number; // 0 = Cold Start, 1 = 1st Refreshed, etc.
  debug?: DebugInfo; 
}

// NEW: For passing minimal info to LLM for selection
export interface CandidateItem {
  id: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
}

// UPDATED: LLM now returns IDs, not full content
export interface RecommendationResponse {
    selected_article_ids: string[];
    reasoning?: string; // Optional: Why these 5?
}

// New Interface for managing the live process view
export interface ProcessState {
  isProcessing: boolean;
  logs: string[];
  currentDebugInfo: Partial<DebugInfo>;
}
