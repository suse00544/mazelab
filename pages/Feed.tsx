import React, { useState, useEffect, useRef } from 'react';
import { db } from '../services/db';
import { Article, User, Interaction, DebugInfo, GeneratedContentBatch, Experiment, ProcessState } from '../types';
import { ArticleCard } from '../components/ArticleCard';
import { ArticleView } from '../components/ArticleView';
import { StrategyCard } from '../components/StrategyCard';
import { runRecommendationPipeline, DEFAULT_STRATEGY_TASK, DEFAULT_CONTENT_TASK } from '../services/geminiService';

interface Props {
  user: User;
  experiment: Experiment;
  selectedModel: string;
  processState: ProcessState; 
  onRecommendationComplete: (sessionId: string) => void;
  onProcessStart: () => void;
  onProcessLog: (msg: string) => void;
  onProcessUpdate: (info: Partial<DebugInfo>) => void;
  onProcessEnd: () => void;
}

export const Feed: React.FC<Props> = ({ 
  user, 
  experiment,
  selectedModel,
  processState,
  onRecommendationComplete, 
  onProcessStart, 
  onProcessLog, 
  onProcessUpdate,
  onProcessEnd 
}) => {
  const [sessions, setSessions] = useState<GeneratedContentBatch[]>([]);
  const [readingArticle, setReadingArticle] = useState<Article | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string>("");
  const [interactedArticleIds, setInteractedArticleIds] = useState<Set<string>>(new Set());
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    const loadSessions = async () => {
        const expSessions = await db.getExperimentSessions(experiment.id);
        if (isMountedRef.current) {
            setSessions(expSessions);
            if (expSessions.length > 0) {
                setCurrentSessionId(expSessions[expSessions.length - 1].sessionId);
            }
        }
    };
    loadSessions();
  }, [experiment.id]);

  const handleArticleClick = (article: Article, sessionId: string) => {
    setReadingArticle(article);
    setInteractedArticleIds(prev => new Set(prev).add(article.id));
  };

  const handleArticleClose = async (interactionData: Omit<Interaction, 'id' | 'timestamp'>) => {
    const interaction: Interaction = {
      ...interactionData,
      id: `int-${Date.now()}`,
      experimentId: experiment.id,
      timestamp: Date.now() 
    };
    
    await db.saveInteraction(interaction);
    setReadingArticle(null);
  };

  const handleGenerateRecommendations = async () => {
    const expId = experiment.id;
    const currentUser = user;
    const activeSessionId = currentSessionId;
    // Snapshot existing sessions
    const currentSessions = sessions;

    onProcessStart();
    onProcessLog(`[Round ${currentSessions.length + 1}] 开始推荐流程...`);
    onProcessLog(`Using Model: ${selectedModel}`);

    try {
      // 1. Skips
      onProcessLog('正在结算 Implicit Feedback...');
      const allDisplayedArticles = currentSessions.flatMap(s => s.articles);
      const skippedArticles = allDisplayedArticles.filter(a => !interactedArticleIds.has(a.id));
      
      const skippedInteractions: Interaction[] = skippedArticles.map(article => ({
        id: `skip-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        userId: currentUser.id,
        experimentId: expId,
        articleId: article.id,
        sessionId: activeSessionId,
        clicked: false,
        dwellTime: 0,
        scrollDepth: 0,
        liked: false,
        favorited: false,
        comment: undefined,
        timestamp: Date.now(), 
        articleContext: {
          title: article.title,
          category: article.category,
          tags: article.tags,
          summary: article.summary,
        }
      }));

      for (const i of skippedInteractions) {
          await db.saveInteraction(i);
      }
      onProcessLog(`已记录 ${skippedInteractions.length} 条跳过行为。`);

      // 2. History
      onProcessLog('正在获取交互历史...');
      const history = await db.getExperimentInteractions(expId);
      
      if (history.length === 0) {
        onProcessLog('警告：无历史记录 (冷启动)。');
      }

      onProcessUpdate({
        rawInteractions: history.map(h => ({ 
             article: h.articleContext.title, 
             action: h.clicked ? 'CLICK' : 'SKIP',
             timestamp: h.timestamp
        }))
      });

      // 3. Pipeline
      const strategyPrompt = experiment.customStrategyPrompt || DEFAULT_STRATEGY_TASK;
      const contentPrompt = experiment.customContentPrompt || DEFAULT_CONTENT_TASK;

      const result = await runRecommendationPipeline(
        history, 
        selectedModel,
        strategyPrompt,
        contentPrompt,
        onProcessLog,
        onProcessUpdate,
        currentUser.id,
        expId
      );
      
      onProcessUpdate(result.debug);
      onProcessLog('更新 Feed...');

      const newSessionId = `sess-${Date.now()}`;
      const nextRoundIndex = currentSessions.length + 1;

      const newBatch: GeneratedContentBatch = {
        sessionId: newSessionId,
        experimentId: expId,
        strategy: result.strategy,
        articles: result.articles,
        timestamp: Date.now(),
        roundIndex: nextRoundIndex + 1, 
        debug: result.debug
      };
      
      await db.saveRecommendationSession(newBatch);

      if (isMountedRef.current) {
          setSessions(prev => [...prev, newBatch]);
          setCurrentSessionId(newSessionId);
          setTimeout(() => {
              const el = document.getElementById(`session-${newSessionId}`);
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
              else bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
          onRecommendationComplete(newSessionId);
      }

      onProcessEnd();
    } catch (e: any) {
      onProcessLog(`ERROR: ${e.message}`);
      console.error(e);
      onProcessEnd();
    }
  };

  return (
    <div className="h-full relative overflow-hidden bg-slate-100">
        <div className={`h-full flex flex-col ${readingArticle ? 'hidden' : 'flex'}`}>
          <div className="flex-1 overflow-y-auto w-full scroll-smooth pb-24 px-4 sm:px-0">
            {sessions.map((session, index) => (
                <div 
                    key={session.sessionId} 
                    id={`session-${session.sessionId}`}
                    className="max-w-2xl mx-auto animate-[fadeIn_0.5s_ease-out]"
                >
                    <div className="flex items-center justify-center py-8">
                        <div className="h-px bg-slate-300 w-full max-w-xs"></div>
                        <span className="px-4 text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-100">
                            {index === 0 ? '✨ 第一刷 (冷启动)' : `🔄 第 ${index + 1} 刷推荐`}
                        </span>
                        <div className="h-px bg-slate-300 w-full max-w-xs"></div>
                    </div>

                    {session.strategy && (
                        <StrategyCard strategy={session.strategy} roundIndex={session.roundIndex} />
                    )}

                    <div>
                        {session.articles.map(article => (
                            <ArticleCard 
                                key={article.id}
                                article={article} 
                                onClick={() => handleArticleClick(article, session.sessionId)} 
                            />
                        ))}
                    </div>
                </div>
            ))}
            <div ref={bottomRef} className="h-4" />
          </div>

          <div className="absolute bottom-6 left-0 right-0 flex justify-center px-4 z-20 pointer-events-none">
              <button
                onClick={handleGenerateRecommendations}
                disabled={processState.isProcessing}
                className="pointer-events-auto shadow-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-80 text-white px-8 py-4 rounded-full font-bold text-lg transition-all transform hover:scale-105 active:scale-95 flex items-center gap-3 border-4 border-white/20 backdrop-blur-sm"
              >
                {processState.isProcessing ? (
                    <>
                      <span className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin"/>
                      AI 正在思考...
                    </>
                ) : (
                    <>
                      <span>✨</span>
                      <span>获取第 {sessions.length + 1} 刷</span>
                    </>
                )}
              </button>
          </div>
        </div>

        {readingArticle && (
            <div className="absolute inset-0 z-30">
                 <ArticleView 
                    article={readingArticle} 
                    userId={user.id} 
                    sessionId={currentSessionId}
                    experimentId={experiment.id}
                    onClose={handleArticleClose} 
                  />
            </div>
        )}
    </div>
  );
};