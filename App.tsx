import React, { useState } from 'react';
import { db } from './services/db';
import { User, ProcessState, Experiment, UserProfile } from './types';
import { Feed } from './pages/Feed';
import { Admin } from './pages/Admin';
import { UserSelect } from './components/UserSelect';
import { HistoryModal } from './components/HistoryModal';
import { ModelSelector, MODELS } from './components/ModelSelector';
import { TracePopover } from './components/TracePopover';
import { ConfigModal } from './components/ConfigModal';
import { OnboardingWizard } from './components/OnboardingWizard';
import { crawlAndImportByKeywords } from './services/autoCrawlService';

const INITIAL_PROCESS_STATE: ProcessState = {
    isProcessing: false,
    logs: [],
    currentDebugInfo: {}
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentExperiment, setCurrentExperiment] = useState<Experiment | null>(null);
  const [view, setView] = useState<'feed' | 'admin'>('feed');
  const [showHistory, setShowHistory] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const [selectedModel, setSelectedModel] = useState(MODELS[0].id); 
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); 
  const [configProps, setConfigProps] = useState<{strategy: string, content: string} | null>(null);
  const [experimentStates, setExperimentStates] = useState<Record<string, ProcessState>>({});
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingLogs, setOnboardingLogs] = useState<string[]>([]);
  const [isOnboardingProcessing, setIsOnboardingProcessing] = useState(false);

  const activeProcessState = currentExperiment ? (experimentStates[currentExperiment.id] || INITIAL_PROCESS_STATE) : INITIAL_PROCESS_STATE;
  const updateExperimentState = (expId: string, update: Partial<ProcessState> | ((prev: ProcessState) => Partial<ProcessState>)) => {
      setExperimentStates(prev => {
          const currentState = prev[expId] || INITIAL_PROCESS_STATE;
          const changes = typeof update === 'function' ? update(currentState) : update;
          return { ...prev, [expId]: { ...currentState, ...changes } };
      });
  };

  const handleUserSelect = async (user: User) => {
      setCurrentUser(user);
      const active = await db.getActiveExperiment(user.id);
      if (active) setCurrentExperiment(active);
  };
  
  const handleCreateExperiment = async () => {
      if (!currentUser) return;
      setShowOnboarding(true);
  };

  const handleOnboardingComplete = async (profile: UserProfile) => {
      if (!currentUser) return;
      setShowOnboarding(false);
      setIsOnboardingProcessing(true);
      setOnboardingLogs(['开始实验初始化流程...']);

      const addLog = (msg: string) => {
          setOnboardingLogs(prev => [...prev, msg]);
      };

      try {
          addLog('1. 根据用户偏好生成搜索关键词...');
          const keywordRes = await fetch('/api/ai/generate-keywords', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ profile, model: selectedModel })
          });
          if (!keywordRes.ok) {
              const err = await keywordRes.json();
              throw new Error(err.error || '关键词生成失败');
          }
          const keywordResult = await keywordRes.json();
          const keywords = keywordResult.keywords || [];
          addLog(`   生成关键词: ${keywords.join(', ')}`);
          addLog(`   推理: ${keywordResult.reasoning || ''}`);
          
          if (keywords.length === 0) {
              throw new Error('未能生成有效关键词');
          }

          addLog('2. 从小红书搜索并导入内容到公共库...');
          const articles = await crawlAndImportByKeywords(
              keywords, 
              3, 
              undefined,
              addLog
          );
          addLog(`   成功导入 ${articles.length} 篇内容`);

          addLog('3. 创建新实验...');
          const { experiment } = await db.createExperiment(currentUser.id);
          setCurrentExperiment(experiment);

          addLog('实验初始化完成！');
          setView('feed');
      } catch (e: any) {
          addLog(`错误: ${e.message}`);
      } finally {
          setIsOnboardingProcessing(false);
      }
  };

  const handleOnboardingSkip = async () => {
      if (!currentUser) return;
      setShowOnboarding(false);
      const { experiment } = await db.createExperiment(currentUser.id);
      setCurrentExperiment(experiment);
      setView('feed');
  };

  const handleSelectHistory = (exp: Experiment) => {
    setCurrentExperiment(exp);
    setView('feed');
    setShowHistory(false);
  };

  const handleOpenConfig = async () => {
      if (currentExperiment) {
          setConfigProps({
              strategy: currentExperiment.customStrategyPrompt || '',
              content: currentExperiment.customContentPrompt || ''
          });
      } else {
          const global = await db.getGlobalConfig();
          setConfigProps({
              strategy: global.strategyPrompt,
              content: global.contentPrompt
          });
      }
      setShowConfig(true);
  };

  const handleSaveConfig = (strategy: string, content: string) => {
      if (currentExperiment) {
          setCurrentExperiment({ ...currentExperiment, customStrategyPrompt: strategy, customContentPrompt: content });
      }
  };

  const handleReset = () => {
      if(confirm('Reset DB?')) { /* Requires backend reset endpoint usually, ignoring for now */ }
  }

  const handleLogout = () => {
      setCurrentUser(null);
      setCurrentExperiment(null);
      setExperimentStates({});
  }

  if (!currentUser) return <UserSelect onSelect={handleUserSelect} />;

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-100">
      <div className="h-14 bg-slate-900 text-white flex items-center justify-between px-4 shrink-0 shadow-md z-30 relative">
        <div className="flex items-center gap-3 md:gap-4">
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden text-slate-400 hover:text-white p-1 -ml-2">☰</button>
          <span className="font-extrabold text-xl tracking-tight text-indigo-400">Maze Lab</span>
          <div className="hidden md:flex items-center gap-2">
             <img src={currentUser.avatar} className="w-8 h-8 rounded-full bg-slate-100 border border-slate-600" alt="avatar" />
             <span className="font-bold text-sm hidden sm:block">{currentUser.username}</span>
          </div>
          <div className="hidden md:flex bg-slate-800 rounded-lg p-1 items-center gap-1 border border-slate-700 ml-2 relative">
             <button onClick={() => setShowHistory(true)} className="flex items-center gap-2 px-3 py-1 rounded hover:bg-slate-700 transition-all max-w-[120px] sm:max-w-xs">
                {currentExperiment ? <span className="text-xs font-mono text-emerald-100 truncate">{currentExperiment.name}</span> : <span className="text-xs text-slate-400">选择实验...</span>}
             </button>
             <button onClick={handleOpenConfig} className="p-1.5 rounded hover:bg-slate-700 text-slate-400 hover:text-white">⚙️</button>
             <button onClick={() => setShowTrace(!showTrace)} className={`p-1.5 rounded hover:bg-slate-700 ${activeProcessState.isProcessing ? 'text-emerald-400' : 'text-slate-400'}`}>⚡</button>
             <button onClick={handleCreateExperiment} className="ml-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold">+</button>
          </div>
        </div>
        <div className="hidden md:flex gap-4 text-sm items-center">
           <ModelSelector selectedModel={selectedModel} onSelect={setSelectedModel} />
           <button onClick={() => setView('feed')} className={`hover:text-white ${view === 'feed' ? 'text-white font-bold border-b-2 border-indigo-500' : 'text-slate-400'}`}>Feed</button>
           <button onClick={() => setView('admin')} className={`hover:text-white ${view === 'admin' ? 'text-white font-bold border-b-2 border-indigo-500' : 'text-slate-400'}`}>后台</button>
           <button onClick={handleLogout} className="text-slate-500 hover:text-white ml-2">Exit</button>
        </div>
      </div>

      {showTrace && <div className="md:hidden fixed top-14 right-2 z-50"><TracePopover processState={activeProcessState} onClose={() => setShowTrace(false)} /></div>}
      {showTrace && <div className="hidden md:block absolute top-14 right-4 z-50"><TracePopover processState={activeProcessState} onClose={() => setShowTrace(false)} /></div>}

      <div className="flex-1 overflow-hidden relative">
        {view === 'admin' ? (
          <div className="h-full overflow-y-auto bg-slate-50"><Admin user={currentUser} onStartExperiment={handleCreateExperiment} /></div>
        ) : (
            <div className="h-full bg-slate-100">
              {currentExperiment ? (
                  <Feed 
                    key={currentExperiment.id}
                    user={currentUser} 
                    experiment={currentExperiment}
                    selectedModel={selectedModel}
                    processState={activeProcessState}
                    onRecommendationComplete={() => {}}
                    onProcessStart={() => updateExperimentState(currentExperiment.id, { isProcessing: true, logs: [], currentDebugInfo: {} })}
                    onProcessLog={(msg) => updateExperimentState(currentExperiment.id, prev => ({ logs: [...prev.logs, msg] }))}
                    onProcessUpdate={(info) => updateExperimentState(currentExperiment.id, prev => ({ currentDebugInfo: { ...prev.currentDebugInfo, ...info } }))}
                    onProcessEnd={() => updateExperimentState(currentExperiment.id, { isProcessing: false })}
                  />
              ) : (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 p-10 text-center">
                      <h2 className="text-xl font-bold text-slate-700 mb-2">准备好开始了吗？</h2>
                      <button onClick={handleCreateExperiment} className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-bold shadow-lg hover:bg-indigo-700">开始新实验</button>
                  </div>
              )}
            </div>
        )}
      </div>
      
      {showHistory && currentUser && <HistoryModal user={currentUser} onClose={() => setShowHistory(false)} onSelectExperiment={handleSelectHistory} />}
      {showConfig && configProps && <ConfigModal initialStrategyPrompt={configProps.strategy} initialContentPrompt={configProps.content} experimentId={currentExperiment?.id} onClose={() => setShowConfig(false)} onSave={handleSaveConfig} />}
      
      {showOnboarding && currentUser && (
        <OnboardingWizard 
          userId={currentUser.id} 
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}

      {isOnboardingProcessing && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-slate-900 rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse"></div>
              <h2 className="text-white font-bold text-lg">正在初始化实验...</h2>
            </div>
            <div className="bg-black/50 rounded-lg p-4 max-h-64 overflow-y-auto font-mono text-xs text-slate-300 space-y-1">
              {onboardingLogs.map((log, i) => (
                <div key={i} className={log.startsWith('错误') ? 'text-red-400' : ''}>{log}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;