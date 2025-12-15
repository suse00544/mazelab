
export interface Article {
  id: string;
  title: string;
  content: string; // Markdown or plain text
  summary: string;
  category: string;
  tags: string[];
  // difficulty removed
  tone: 'Professional' | 'Casual' | 'Humorous' | 'Deep';
  estimatedReadTime: number; // seconds
  created_at: number;
  
  // New fields for Content Management
  isPublic: boolean; // True = in Public Library
  ownerId?: string; // If private/created by user
  imageUrl?: string; // Cover image URL
  deletedAt?: number; // Timestamp for soft deletion
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
