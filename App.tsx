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
import { ConfirmModal } from './components/ConfirmModal';
import { ExperimentCreationModal } from './components/ExperimentCreationModal';

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
  const [showConfigForExperiment, setShowConfigForExperiment] = useState<Experiment | null>(null);
  const [experimentStates, setExperimentStates] = useState<Record<string, ProcessState>>({});
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showExperimentCreation, setShowExperimentCreation] = useState(false);

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
      setShowExperimentCreation(true);
  };

  const handleExperimentCreate = async (config: {
    name: string;
    mode: 'solo' | 'community';
  }) => {
    if (!currentUser) return;

    try {
      const { experiment } = await db.createExperiment(currentUser.id, config);
      setCurrentExperiment(experiment);
      setShowExperimentCreation(false);
      setView('feed');
    } catch (e: any) {
      alert('创建实验失败: ' + e.message);
    }
  };


  const handleSelectHistory = (exp: Experiment) => {
    setCurrentExperiment(exp);
    setView('feed');
    setShowHistory(false);
  };

  const handleOpenConfig = async () => {
      setShowConfigForExperiment(currentExperiment || null);
      setShowConfig(true);
  };

  const handleSaveConfig = (updates: Partial<Experiment>) => {
      if (currentExperiment) {
          setCurrentExperiment({
            ...currentExperiment,
            ...updates
          });
      }
  };

  const handleReset = () => {
      setShowResetConfirm(true);
  }

  const handleConfirmReset = () => {
      setShowResetConfirm(false);
      /* Requires backend reset endpoint usually, ignoring for now */
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
             <button onClick={handleCreateExperiment} className="ml-1 px-2 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold">+</button>
          </div>
        </div>
        <div className="hidden md:flex gap-4 text-sm items-center">
           <ModelSelector selectedModel={selectedModel} onSelect={setSelectedModel} />
           <button onClick={() => setShowTrace(!showTrace)} className={`p-1.5 rounded hover:bg-slate-700 ${activeProcessState.isProcessing ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} title="Execution Trace">⚡</button>
           <button onClick={() => setView('feed')} className={`hover:text-white ${view === 'feed' ? 'text-white font-bold border-b-2 border-indigo-500' : 'text-slate-400'}`}>Feed</button>
           <button onClick={() => setView('admin')} className={`hover:text-white ${view === 'admin' ? 'text-white font-bold border-b-2 border-indigo-500' : 'text-slate-400'}`}>后台</button>
           <button onClick={handleLogout} className="text-slate-500 hover:text-white ml-2">Exit</button>
        </div>
      </div>

      {showTrace && <div className="md:hidden fixed top-14 right-2 z-50"><TracePopover processState={activeProcessState} onClose={() => setShowTrace(false)} /></div>}
      {showTrace && <div className="hidden md:block absolute top-14 right-4 z-50"><TracePopover processState={activeProcessState} onClose={() => setShowTrace(false)} /></div>}

      <div className="flex-1 overflow-hidden relative">
        {view === 'admin' ? (
          <div className="h-full overflow-y-auto bg-slate-50"><Admin key={currentExperiment?.id || 'no-experiment'} user={currentUser} experiment={currentExperiment} onStartExperiment={handleCreateExperiment} /></div>
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
                    onShowTrace={setShowTrace}
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
      
      {showHistory && currentUser && (
        <HistoryModal
          user={currentUser}
          currentExperimentId={currentExperiment?.id}
          onClose={() => setShowHistory(false)}
          onSelectExperiment={handleSelectHistory}
          onExperimentDeleted={(deletedId) => {
            // 如果删除的是当前实验，清空当前实验
            if (currentExperiment?.id === deletedId) {
              setCurrentExperiment(null);
            }
          }}
        />
      )}
      {showConfig && (
        <ConfigModal
          experiment={showConfigForExperiment || undefined}
          onClose={() => setShowConfig(false)}
          onSave={handleSaveConfig}
        />
      )}

      {showResetConfirm && (
        <ConfirmModal
          message="确定要重置数据库吗？此操作不可恢复。"
          title="重置数据库"
          confirmText="确定重置"
          cancelText="取消"
          onConfirm={handleConfirmReset}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}

      {showExperimentCreation && currentUser && (
        <ExperimentCreationModal
          userId={currentUser.id}
          onClose={() => setShowExperimentCreation(false)}
          onCreate={handleExperimentCreate}
        />
      )}
    </div>
  );
};

export default App;