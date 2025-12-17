import React, { useState, useEffect, useRef } from 'react';
import { db } from '../services/db';
import { Article, User, Interaction, DebugInfo, GeneratedContentBatch, Experiment, ProcessState, RecommendationStrategy } from '../types';
import { ArticleCard } from '../components/ArticleCard';
import { ArticleView } from '../components/ArticleView';
import { runUnifiedRecommendationPipeline } from '../services/geminiService';

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
  onShowTrace: (show: boolean) => void;
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
  onProcessEnd,
  onShowTrace
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
    const currentSessions = sessions;
    const roundIndex = currentSessions.length + 1;

    onProcessStart();

    // 非冷启动时自动打开 Trace Popover
    if (roundIndex > 1) {
      onShowTrace(true);
    }

    onProcessLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    onProcessLog(`🔄 开始第 ${roundIndex} 刷${roundIndex === 1 ? '（冷启动）' : ''}`);
    onProcessLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    onProcessLog(`模型: ${selectedModel}`);
    onProcessLog(`实验模式: ${experiment.mode || 'solo'}`);

    // 创建 Trace Logger
    const { TraceLogger } = await import('../services/autoCrawlService');
    const trace = new TraceLogger(currentUser.id, expId);
    await trace.startRun('recommendation');

    try {
      // ========== 冷启动逻辑：直接展示个人库全部内容 ==========
      if (roundIndex === 1) {
        onProcessLog('');
        onProcessLog('✨ 冷启动模式：直接展示个人库所有内容');

        // 获取个人库内容
        const personalLibrary = await db.getPersonalLibrary(currentUser.id, expId);
        onProcessLog(`✓ 个人库共有 ${personalLibrary.length} 篇内容`);

        // 验证个人库内容数量
        if (personalLibrary.length < 20) {
          onProcessLog('');
          onProcessLog(`⚠️ 个人库内容不足！当前 ${personalLibrary.length} 篇，需要至少 20 篇`);
          onProcessLog(`请前往「内容后台」添加更多内容到个人库`);
          await trace.endRun('failed');
          onProcessEnd();
          alert(`个人库内容不足！\n\n当前只有 ${personalLibrary.length} 篇内容，需要至少 20 篇才能开始实验。\n\n请前往「内容后台」添加更多内容到个人库。`);
          return;
        }

        // 保存冷启动会话
        onProcessLog('');
        onProcessLog('💾 保存冷启动会话');
        const newSessionId = `sess-${Date.now()}`;

        const compatibleStrategy: RecommendationStrategy = {
          user_profile: {
            interests_summary: '冷启动阶段',
            behavior_patterns: '无历史交互',
            engagement_level: '新用户'
          },
          recommendation_strategy: {
            personalization_ratio: 0,
            exploration_ratio: 1.0,
            serendipity_ratio: 0,
            personalized_approach: '展示个人库全部内容',
            exploration_approach: '冷启动策略'
          },
          detailed_reasoning: {
            why_personalized: '冷启动阶段无历史数据',
            why_exploration: '展示个人库全部内容供用户探索',
            what_to_avoid: '无'
          }
        };

        const newBatch: GeneratedContentBatch = {
          sessionId: newSessionId,
          experimentId: expId,
          strategy: compatibleStrategy,
          articles: personalLibrary,
          timestamp: Date.now(),
          roundIndex: roundIndex,
          debug: {
            logs: ['冷启动：直接展示个人库全部内容'],
            rawInteractions: []
          }
        };

        await db.saveRecommendationSession(newBatch);
        onProcessLog(`✓ 会话已保存，共展示 ${personalLibrary.length} 篇内容`);

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

        await trace.endRun('completed');
        onProcessLog('');
        onProcessLog(`✅ 冷启动完成！展示了个人库的全部 ${personalLibrary.length} 篇内容`);
        onProcessLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        onProcessEnd();
        return;
      }

      // ========== 后续推荐：执行AI推荐流程 ==========
      // 1. 结算跳过行为（只记录上一次会话中未点击的内容作为隐式负反馈）
      onProcessLog('');
      onProcessLog('📊 步骤 1/3: 结算 Implicit Feedback');

      // 只处理上一次会话中的文章，避免重复记录
      const lastSession = currentSessions[currentSessions.length - 1];
      if (lastSession) {
        const lastSessionArticles = lastSession.articles;
        const skippedArticles = lastSessionArticles.filter(a => !interactedArticleIds.has(a.id));

        const skippedInteractions: Interaction[] = skippedArticles.map(article => ({
          id: `skip-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          userId: currentUser.id,
          experimentId: expId,
          articleId: article.id,
          sessionId: lastSession.sessionId,  // 使用文章实际所属的会话 ID
          clicked: false,
          dwellTime: 0,
          scrollDepth: 0,
          liked: false,
          favorited: false,
          comment: undefined,
          timestamp: Date.now(),
          articleContext: {
            title: article.title,
            tags: article.tag_list || [],
            summary: (article.desc || '').slice(0, 100),
          }
        }));

        for (const i of skippedInteractions) {
            await db.saveInteraction(i);
        }
        onProcessLog(`✓ 已记录 ${skippedInteractions.length} 条跳过行为（来自会话 ${lastSession.sessionId.slice(-6)}）`);
      } else {
        onProcessLog(`✓ 无历史会话，跳过结算`);
      }

      // 2. 获取交互历史
      onProcessLog('');
      onProcessLog('📚 步骤 2/3: 获取交互历史');
      const history = await db.getExperimentInteractions(expId);
      onProcessLog(`✓ 加载了 ${history.length} 条历史交互`);

      // 3. 定义搜索回调（当 Stage 1 决定需要搜索时调用）
      const apiKey = localStorage.getItem('GEMINI_API_KEY') || '';
      const libraryType = experiment.mode === 'solo' ? 'personal' : 'community';

      const handleSearch = async (keywords: string[], articlesPerKeyword: number) => {
        onProcessLog('');
        onProcessLog('🔍 Stage 1 决策: 需要搜索新内容');
        onProcessLog(`关键词: ${keywords.join(', ')}`);

        try {
          const { crawlAndImportByKeywords } = await import('../services/autoCrawlService');

          onProcessLog('🔎 开始搜索小红书内容...');
          const articles = await crawlAndImportByKeywords(
            keywords,
            articlesPerKeyword,
            currentUser.id,
            trace,
            onProcessLog,
            undefined,
            libraryType,
            expId  // 传递实验ID
          );
          onProcessLog(`✓ 成功导入 ${articles.length} 篇新内容到${libraryType === 'personal' ? '个人库' : '社区库'}`);
        } catch (e: any) {
          onProcessLog(`⚠️ 搜索导入失败: ${e.message}，继续使用现有内容`);
        }
      };

      // 4. 执行统一推荐流程（4 阶段）
      onProcessLog('');
      onProcessLog('🤖 步骤 3/3: 执行四阶段推荐流程');

      const result = await runUnifiedRecommendationPipeline(
        history,
        selectedModel,
        roundIndex,
        onProcessLog,
        onProcessUpdate,
        currentUser.id,
        expId,
        experiment.mode,
        handleSearch,
        currentSessions,  // 传递 sessions 以保留展示顺序
        experiment        // 传递实验配置以获取自定义 prompt
      );

      // 检查推荐结果
      if (!result.final_articles || result.final_articles.length === 0) {
        onProcessLog(`⚠️ 推荐结果为空!`);
        throw new Error('推荐系统未返回内容');
      } else {
        onProcessLog(`✓ 最终推荐 ${result.final_articles.length} 篇内容`);
      }

      // 5. 保存并展示
      onProcessLog('');
      onProcessLog('💾 保存推荐结果并更新 Feed');
      const newSessionId = `sess-${Date.now()}`;

      // 构造兼容的 strategy 对象（从新的四阶段结果提取）
      const profile = result.stage1_profile;
      const compatibleStrategy: RecommendationStrategy = {
        user_profile: {
          interests_summary: [
            ...profile.interest_hierarchy.core,
            ...profile.interest_hierarchy.edge
          ].join(', '),
          behavior_patterns: profile.content_preferences.style.join(', '),
          engagement_level: profile.interest_evolution
        },
        recommendation_strategy: {
          personalization_ratio: 1 - profile.exploration_tendency,
          exploration_ratio: profile.exploration_tendency,
          serendipity_ratio: 0.0,
          personalized_approach: profile.interest_hierarchy.core.join(', '),
          exploration_approach: profile.interest_hierarchy.potential.join(', ')
        },
        detailed_reasoning: {
          why_personalized: result.stage4_fine.recommendations
            .filter(r => r.slot_type === 'core')
            .map(r => r.reasoning).join('; '),
          why_exploration: result.stage4_fine.recommendations
            .filter(r => r.slot_type === 'explore' || r.slot_type === 'edge')
            .map(r => r.reasoning).join('; '),
          what_to_avoid: '重复内容和低质量内容'
        }
      };

      const newBatch: GeneratedContentBatch = {
        sessionId: newSessionId,
        experimentId: expId,
        strategy: compatibleStrategy,
        articles: result.final_articles,
        timestamp: Date.now(),
        roundIndex: roundIndex,
        debug: result.debug
      };

      await db.saveRecommendationSession(newBatch);
      onProcessLog(`✓ 推荐会话已保存`);

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

      await trace.endRun('completed');
      onProcessLog('');
      onProcessLog(`✅ 第 ${roundIndex} 刷推荐完成！`);
      onProcessLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      onProcessEnd();

      // 非冷启动完成后自动关闭 Trace
      if (roundIndex > 1) {
        setTimeout(() => onShowTrace(false), 1500);
      }
    } catch (e: any) {
      await trace.endRun('failed');
      onProcessLog('');
      onProcessLog(`❌ 错误: ${e.message}`);
      onProcessLog(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.error(e);
      onProcessEnd();

      // 出错时也关闭 Trace（延迟让用户看到错误信息）
      if (roundIndex > 1) {
        setTimeout(() => onShowTrace(false), 3000);
      }
    }
  };

  return (
    <div className="h-full relative overflow-hidden bg-slate-100">
        <div className={`h-full flex flex-col ${readingArticle ? 'hidden' : 'flex'}`}>
          <div className="flex-1 overflow-y-auto w-full scroll-smooth pb-24 px-4 sm:px-0">
            {sessions.length === 0 ? (
              /* 缺省页：无内容时显示 */
              <div className="h-full flex flex-col items-center justify-center text-center px-8">
                <div className="text-6xl font-bold text-slate-200 mb-4 tracking-tight">maze.ai</div>
                <p className="text-slate-400 text-sm max-w-md leading-relaxed">
                  点击下方按钮获取第一刷内容
                  <br />
                  <span className="text-slate-500">（将展示个人内容库的全部内容）</span>
                </p>
              </div>
            ) : (
              sessions.map((session, index) => (
                <div
                    key={session.sessionId}
                    id={`session-${session.sessionId}`}
                    className="max-w-lg mx-auto animate-[fadeIn_0.5s_ease-out] px-3"
                >
                    <div className="flex items-center justify-center py-8">
                        <div className="h-px bg-slate-300 w-full max-w-xs"></div>
                        <span className="px-4 text-xs font-bold text-slate-400 uppercase tracking-wider bg-slate-100">
                            {index === 0 ? '✨ 第一刷 (冷启动)' : `🔄 第 ${index + 1} 刷推荐`}
                        </span>
                        <div className="h-px bg-slate-300 w-full max-w-xs"></div>
                    </div>

                    <div className="flex gap-3">
                        {/* 左列：奇数位置 (0, 2, 4...) */}
                        <div className="flex-1 flex flex-col">
                            {session.articles.filter((_, i) => i % 2 === 0).map(article => (
                                <ArticleCard
                                    key={article.id}
                                    article={article}
                                    onClick={() => handleArticleClick(article, session.sessionId)}
                                />
                            ))}
                        </div>
                        {/* 右列：偶数位置 (1, 3, 5...) */}
                        <div className="flex-1 flex flex-col">
                            {session.articles.filter((_, i) => i % 2 === 1).map(article => (
                                <ArticleCard
                                    key={article.id}
                                    article={article}
                                    onClick={() => handleArticleClick(article, session.sessionId)}
                                />
                            ))}
                        </div>
                    </div>
                </div>
              ))
            )}
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