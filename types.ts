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

// 库类型和实验模式
export type LibraryType = 'personal' | 'community';
export type ExperimentMode = 'solo' | 'community';

// 文章接口 - 完全按照小红书爬虫返回的字段
export interface Article {
  // 主键
  id: string;

  // 库类型（Solo/Community 模式）
  library_type?: LibraryType;  // 'personal' | 'community'
  owner_id?: string;           // Solo模式下的所有者ID，Community模式为NULL
  experiment_id?: string;      // Personal库的实验ID，Community库为NULL

  // 小红书核心字段（完全按照爬虫返回）
  xsec_token?: string;      // 安全令牌
  title: string;             // 笔记标题
  desc: string;             // 笔记描述/正文
  type?: string;            // 笔记类型（normal/video）
  
  // 用户信息（扁平化存储）
  user_id?: string;         // 用户ID
  user_nickname?: string;   // 用户昵称
  user_avatar?: string;     // 用户头像URL
  // 或者使用 user 对象（兼容两种格式）
  user?: {
    user_id: string;
    nickname: string;
    avatar: string;
  };
  
  // 媒体资源
  cover?: string;           // 封面图URL
  images?: string[];        // 图片URL数组
  video_url?: string;      // 视频URL（如果有）
  
  // 统计数据（字符串格式，保持原样）
  liked_count?: string;     // 点赞数
  collected_count?: string; // 收藏数
  comment_count?: string;  // 评论数
  share_count?: string;     // 分享数
  
  // 其他信息
  time?: number;           // 发布时间（Unix时间戳，秒）
  tag_list?: string[];     // 标签列表
  
  // 系统字段（用于管理）
  created_at?: number;     // 创建/入库时间（Unix时间戳，毫秒）
  updated_at?: number;     // 更新时间（Unix时间戳，毫秒）
}

// ==========================================
// 用户画像类型（用于冷启动关键词生成）
// ==========================================
export interface UserProfile {
  userId: string;
  answers: Record<string, any>;  // 用户输入的描述或其他信息
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
  mode?: ExperimentMode;  // 'solo' | 'community'

  // 冷启动用户描述
  userDescription?: string;

  // ==========================================
  // 四阶段推荐 Prompt 配置
  // 每个阶段分为系统锁定部分（不可修改）和用户可修改部分
  // ==========================================

  // 阶段 1: 用户画像深度分析
  stage1_custom_prompt?: string;

  // 阶段 2: 多通道召回
  stage2_custom_prompt?: string;

  // 阶段 3: 质量过滤
  stage3_custom_prompt?: string;

  // 阶段 4: 精排 + 多样性
  stage4_custom_prompt?: string;

  // 推荐参数配置
  recommendation_config?: {
    // E&E 比例配置
    core_ratio: number;      // 核心兴趣比例，默认 0.4
    edge_ratio: number;      // 边缘兴趣比例，默认 0.3
    hot_ratio: number;       // 热门内容比例，默认 0.2
    explore_ratio: number;   // 随机探索比例，默认 0.1

    // 精排输出配置
    final_count: number;     // 最终推荐数量，默认 5

    // 多样性约束
    min_unique_tags: number; // 最少不同标签数，默认 3
  };

  // 保留旧字段（兼容性）
  customKeywordColdStartPrompt?: string;
  customKeywordInteractionPrompt?: string;
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
  highlights?: Array<{
    text: string;      // 选中的文本
    comment: string;   // 对该段的评论
    startOffset?: number;  // 可选：文本位置
    endOffset?: number;
  }>;

  timestamp: number;
  
  // Context snapshot for the AI (so it knows what was shown)
  articleContext: {
    title: string;
    tags: string[];
    summary?: string;
  };
}

// ==========================================
// 新的统一推荐流程类型（方案 B：四阶段重构版）
// ==========================================

// 阶段 1: 用户画像深度分析
export interface Stage1UserProfile {
  // 兴趣层次图谱
  interest_hierarchy: {
    core: string[];      // 核心兴趣（高频交互、明确偏好）
    edge: string[];      // 边缘兴趣（偶尔交互、潜在兴趣）
    potential: string[]; // 潜在兴趣（基于核心兴趣推断）
  };
  // 内容偏好
  content_preferences: {
    depth: 'shallow' | 'medium' | 'deep';  // 内容深度偏好
    style: string[];     // 风格偏好（实用、理论、案例、观点等）
    length: 'short' | 'medium' | 'long';   // 内容长度偏好
  };
  // 探索倾向（0-1，越高越愿意探索新内容）
  exploration_tendency: number;
  // 兴趣演进分析
  interest_evolution: string;
  // 搜索决策（是否需要爬取新内容）
  search_decision: {
    need_search: boolean;
    reasoning: string;
    keywords?: string[];
    articles_per_keyword?: number;
  };
}

// 阶段 2: 多通道召回结果
export interface Stage2RecallResult {
  channels: {
    core: string[];        // 核心兴趣通道（40%）
    edge: string[];        // 边缘兴趣通道（30%）
    hot: string[];         // 热门内容通道（20%）
    explore: string[];     // 随机探索通道（10%）
  };
  total_recalled: number;
  reasoning: string;
}

// 阶段 3: 质量过滤结果
export interface Stage3FilterResult {
  passed_ids: string[];
  filtered_out: {
    id: string;
    reason: 'low_quality' | 'already_viewed' | 'too_similar' | 'off_topic';
  }[];
  quality_scores: {
    id: string;
    score: number;  // 0-1
    breakdown: {
      content_quality: number;
      relevance: number;
      freshness: number;
    };
  }[];
}

// 阶段 4: 精排结果
export interface Stage4RankResult {
  recommendations: Array<{
    id: string;
    rank: number;              // 1-5
    slot_type: 'core' | 'edge' | 'explore';  // 位置策略
    reasoning: string;
    scores: {
      relevance: number;       // 相关性分
      diversity: number;       // 多样性贡献
      final: number;           // 综合分
    };
  }>;
  diversity_metrics: {
    unique_tags: number;
    category_distribution: Array<{ category: string; count: number }>;
  };
}

// 兼容旧类型名称
export type UserProfileAndSearchDecision = Stage1UserProfile;
export type RecallResult = Stage2RecallResult;
export type CoarseRankResult = Stage3FilterResult;
export type FineRankResult = Stage4RankResult;

// 统一推荐结果（包含所有阶段）
export interface UnifiedRecommendationResult {
  stage1_profile: UserProfileAndSearchDecision;
  stage2_recall: RecallResult;
  stage3_coarse: CoarseRankResult;
  stage4_fine: FineRankResult;
  final_articles: Article[];
  debug: DebugInfo;
}

// 保留旧类型（兼容性）
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
  // 推荐 session 历史（用于展示所有被推荐的内容）
  sessions?: Array<{
    sessionId: string;
    roundIndex: number;
    timestamp: number;
    articles: Array<{
      id: string;
      title: string;
      tags: string[];
    }>;
  }>;
  // 新的统一推荐流程调试信息
  unified_pipeline?: {
    stage1_input?: any;
    stage1_prompt?: string;
    stage1_output?: UserProfileAndSearchDecision;
    stage2_input?: any;
    stage2_prompt?: string;
    stage2_output?: RecallResult;
    stage3_input?: any;
    stage3_prompt?: string;
    stage3_output?: CoarseRankResult;
    stage4_input?: any;
    stage4_prompt?: string;
    stage4_output?: FineRankResult;
  };
  // 保留旧字段（兼容性）
  strategyPrompt?: string;
  strategyResponse?: any;
  contentPrompt?: string;
  contentResponse?: any;
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

// NEW: For passing info to LLM for selection
export interface CandidateItem {
  id: string;
  title: string;
  content: string;  // 完整内容（小红书笔记不长，直接传入）
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
