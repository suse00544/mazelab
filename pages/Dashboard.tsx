import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { GeneratedContentBatch, User, ProcessState, Experiment } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props {
  user: User;
  experiment: Experiment;
  sessionId: string | null;
  processState: ProcessState; 
}

export const Dashboard: React.FC<Props> = ({ user, experiment, sessionId, processState }) => {
  const [sessions, setSessions] = useState<GeneratedContentBatch[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<GeneratedContentBatch | null>(null);
  const [viewMode, setViewMode] = useState<'analysis' | 'trace'>('analysis');
  const [activeTraceTab, setActiveTraceTab] = useState<'strategy' | 'content'>('strategy');

  useEffect(() => {
      const load = async () => {
          const all = await db.getExperimentSessions(experiment.id);
          setSessions(all);
          if (sessionId) {
              setSelectedSessionId(sessionId);
          } else if (all.length > 0 && !selectedSessionId) {
              setSelectedSessionId(all[all.length - 1].sessionId);
          }
      };
      load();
  }, [experiment.id, sessionId, processState.isProcessing]);

  useEffect(() => {
      if (selectedSessionId && sessions.length > 0) {
          const found = sessions.find(s => s.sessionId === selectedSessionId);
          setSelectedBatch(found || null);
      }
  }, [selectedSessionId, sessions]);

  useEffect(() => {
    if (processState.isProcessing) {
        setViewMode('trace');
    } else {
        if (processState.logs && processState.logs.length > 0) {
            setViewMode('analysis');
        }
    }
  }, [processState.isProcessing]);

  // Render helpers same as before...
  const renderTraceView = () => (
      <div className="h-full bg-slate-900 text-slate-200 p-4 font-mono text-xs overflow-hidden flex flex-col">
        <div className="flex justify-between items-center border-b border-slate-700 pb-2 mb-4 shrink-0">
             <h2 className="text-emerald-400 font-bold text-sm flex items-center gap-2">
                <span className={`inline-block w-2 h-2 rounded-full ${processState.isProcessing ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`}></span>
                AI Execution Trace
            </h2>
            <div className="flex gap-2">
                <span className="text-slate-500 text-[10px]">{processState.isProcessing ? 'RUNNING' : 'COMPLETED'}</span>
            </div>
        </div>
        
        <div className="flex-1 overflow-hidden grid grid-cols-12 gap-4 min-h-0">
             <div className="col-span-4 bg-black/30 rounded border border-slate-700 p-2 overflow-y-auto flex flex-col-reverse h-full">
                <div className="space-y-1">
                  {processState.logs?.map((log, i) => (
                    <div key={i} className="break-words border-l-2 border-slate-700 pl-2">
                      <span className="text-slate-500 mr-2">[{new Date().toLocaleTimeString()}]</span>
                      {log}
                    </div>
                  ))}
                </div>
             </div>

             <div className="col-span-8 flex flex-col border border-slate-700 rounded bg-black/20 h-full overflow-hidden">
                <div className="flex border-b border-slate-700 bg-slate-800 shrink-0">
                    <button onClick={() => setActiveTraceTab('strategy')} className={`px-4 py-2 font-bold transition-colors ${activeTraceTab === 'strategy' ? 'bg-slate-700 text-yellow-400 border-b-2 border-yellow-400' : 'text-slate-400 hover:text-slate-200'}`}>Strategy Input</button>
                    <button onClick={() => setActiveTraceTab('content')} className={`px-4 py-2 font-bold transition-colors ${activeTraceTab === 'content' ? 'bg-slate-700 text-emerald-400 border-b-2 border-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}>Content Input</button>
                </div>
                <div className="p-3 overflow-y-auto flex-1 scrollbar-thin scrollbar-thumb-slate-700 leading-relaxed font-mono relative">
                    {activeTraceTab === 'strategy' && (
                         <div className="whitespace-pre-wrap text-[11px] text-yellow-100/80">{processState.currentDebugInfo?.strategyPrompt || <span className="text-slate-500 italic">Waiting...</span>}</div>
                    )}
                     {activeTraceTab === 'content' && (
                         <div className="whitespace-pre-wrap text-[11px] text-emerald-100/80">{processState.currentDebugInfo?.contentPrompt || <span className="text-slate-500 italic">Waiting...</span>}</div>
                    )}
                </div>
             </div>
        </div>
      </div>
  );

  const renderAnalysisView = () => {
      if (sessions.length === 0) return <div className="h-full flex items-center justify-center p-10 text-slate-400 bg-slate-50">实验刚刚开始。</div>;
      const { strategy } = selectedBatch || {};
      if (selectedBatch && selectedBatch.roundIndex === 1 && !strategy) {
           return (
             <div className="h-full flex flex-col items-center justify-center p-10 bg-slate-50">
                <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-200 max-w-md text-center">
                    <div className="text-4xl mb-4">❄️</div>
                    <h2 className="text-xl font-bold text-slate-800 mb-2">冷启动阶段 (Cold Start)</h2>
                    <p className="text-slate-600">第一刷内容来源于种子配置。</p>
                </div>
             </div>
           );
      }
      if (!strategy) return <div className="p-10 text-center text-slate-400">数据不完整</div>;
      
      const userProfile = strategy.user_profile || { interests_summary: 'N/A', behavior_patterns: 'N/A', engagement_level: 'N/A' };
      const recStrategy = strategy.recommendation_strategy || { personalization_ratio: 0, exploration_ratio: 0, serendipity_ratio: 0, personalized_approach: 'N/A', exploration_approach: 'N/A' };
      const reasoning = strategy.detailed_reasoning || { why_personalized: 'N/A', why_exploration: 'N/A', what_to_avoid: 'N/A' };

      const chartData = [
        { name: '个性化', value: (recStrategy.personalization_ratio || 0) * 100, color: '#4f46e5' },
        { name: '探索', value: (recStrategy.exploration_ratio || 0) * 100, color: '#0ea5e9' },
        { name: '惊喜', value: (recStrategy.serendipity_ratio || 0) * 100, color: '#f59e0b' },
      ];

      return (
        <div className="h-full overflow-y-auto bg-slate-50 p-6">
          <div className="max-w-4xl mx-auto space-y-8">
            <header className="mb-4">
                <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">推荐策略分析</h2>
                <p className="text-slate-500 text-base mt-1">Round {selectedBatch?.roundIndex} - {selectedBatch?.sessionId}</p>
            </header>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
              <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><span className="w-1 h-6 bg-indigo-500 rounded-full"></span>1. 用户画像推断</h3>
              <div className="grid md:grid-cols-2 gap-8">
                <div><span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">兴趣总结</span><p className="text-slate-800 text-lg leading-relaxed font-medium">{userProfile.interests_summary}</p></div>
                <div><span className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 block">行为模式</span><p className="text-slate-700 text-base leading-relaxed">{userProfile.behavior_patterns}</p></div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
               <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><span className="w-1 h-6 bg-sky-500 rounded-full"></span>2. 策略配比</h3>
               <div className="h-32 mb-8">
                 <ResponsiveContainer width="100%" height="100%">
                   <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                      <XAxis type="number" domain={[0, 100]} hide />
                      <YAxis dataKey="name" type="category" width={150} tick={{fontSize: 14, fontWeight: 600, fill: '#475569'}} />
                      <Tooltip />
                      <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={24} label={{ position: 'right', fill: '#64748b', fontSize: 14, fontWeight: 700, formatter: (v: number) => `${v}%` }}>
                        {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                      </Bar>
                   </BarChart>
                 </ResponsiveContainer>
               </div>
               <div className="grid md:grid-cols-2 gap-6 bg-slate-50 p-6 rounded-xl border border-slate-100">
                  <div><h4 className="font-bold text-indigo-700 text-base mb-2">🎯 个性化策略</h4><p className="text-slate-700 text-base leading-relaxed">{recStrategy.personalized_approach}</p></div>
                  <div><h4 className="font-bold text-sky-700 text-base mb-2">🔭 探索策略</h4><p className="text-slate-700 text-base leading-relaxed">{recStrategy.exploration_approach}</p></div>
               </div>
            </div>
          </div>
        </div>
      );
  }

  const renderTabs = () => (
      <div className="flex bg-white border-b border-slate-200 overflow-x-auto">
          {sessions.map((s, idx) => (
              <button key={s.sessionId} onClick={() => setSelectedSessionId(s.sessionId)} className={`px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${selectedSessionId === s.sessionId ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
                  {idx === 0 ? '冷启动 (1刷)' : `第 ${idx + 1} 刷`}
              </button>
          ))}
      </div>
  );

  return (
    <div className="h-full flex flex-col relative bg-slate-50">
        <div className="absolute top-4 right-6 z-10 bg-white shadow-sm rounded-lg p-1 flex border border-slate-200">
             <button onClick={() => setViewMode('analysis')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'analysis' ? 'bg-indigo-100 text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>📊 策略分析</button>
             <button onClick={() => setViewMode('trace')} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${viewMode === 'trace' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>🛠️ 实时 Trace</button>
        </div>
        {viewMode === 'analysis' && sessions.length > 0 && renderTabs()}
        <div className="flex-1 overflow-hidden mt-0">
            {viewMode === 'trace' ? renderTraceView() : renderAnalysisView()}
        </div>
    </div>
  );
};