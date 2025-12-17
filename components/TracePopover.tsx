
import React, { useState } from 'react';
import { ProcessState } from '../types';

interface Props {
    processState: ProcessState;
    onClose?: () => void;
}

export const TracePopover: React.FC<Props> = ({ processState, onClose }) => {
    const [activeTab, setActiveTab] = useState<'log' | 'prompts' | 'interactions'>('log');
    const [expandedInteractionIndex, setExpandedInteractionIndex] = useState<number | null>(null);

    return (
        <div className="fixed top-[60px] right-2 md:right-4 z-50 w-full max-w-[95vw] md:w-[600px] max-h-[85vh] bg-slate-900 border border-slate-700 rounded-lg shadow-2xl flex flex-col text-slate-300 text-xs font-mono overflow-hidden">
             {/* Header */}
             <div className="flex bg-slate-800 border-b border-slate-700 p-2 items-center justify-between shrink-0">
                 <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${processState.isProcessing ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`} />
                    <span className="font-bold text-slate-200">Execution Trace</span>
                 </div>
                 <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-500">{processState.isProcessing ? 'RUNNING' : 'IDLE'}</span>
                    {onClose && (
                        <button 
                            onClick={onClose}
                            className="text-slate-400 hover:text-white w-5 h-5 flex items-center justify-center rounded hover:bg-slate-700 transition-colors"
                            title="Close Trace"
                        >
                            ✕
                        </button>
                    )}
                 </div>
             </div>

             {/* Tabs */}
             <div className="flex bg-slate-800/50 border-b border-slate-700 shrink-0">
                 <button
                    onClick={() => setActiveTab('log')}
                    className={`flex-1 py-2 text-center transition-colors ${activeTab === 'log' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                 >
                    Logs
                 </button>
                 <button
                    onClick={() => setActiveTab('prompts')}
                    className={`flex-1 py-2 text-center transition-colors ${activeTab === 'prompts' ? 'bg-slate-700 text-cyan-400' : 'text-slate-400 hover:text-slate-200'}`}
                 >
                    Model Prompts
                 </button>
                 <button
                    onClick={() => setActiveTab('interactions')}
                    className={`flex-1 py-2 text-center transition-colors ${activeTab === 'interactions' ? 'bg-slate-700 text-pink-400' : 'text-slate-400 hover:text-slate-200'}`}
                 >
                    User Interactions
                 </button>
             </div>

             {/* Body */}
             <div className="flex-1 overflow-y-auto p-0 min-h-[200px]">
                 {activeTab === 'log' && (
                     <div className="space-y-1 p-3">
                         {processState.logs.length === 0 && <span className="text-slate-600 italic">Waiting for execution...</span>}
                         {processState.logs.map((log, i) => (
                             <div key={i} className="break-words border-l-2 border-slate-700 pl-2 hover:bg-slate-800/50">
                                 <span className="text-slate-500 mr-2">[{i+1}]</span>
                                 {log}
                             </div>
                         ))}
                     </div>
                 )}
                 {activeTab === 'prompts' && (
                      <div className="leading-relaxed p-4 space-y-4">
                          {!processState.currentDebugInfo?.unified_pipeline && (
                              <div className="text-slate-500 italic text-center py-8">
                                  等待推荐流程执行...
                              </div>
                          )}

                          {processState.currentDebugInfo?.unified_pipeline && (
                              <>
                                  {/* Stage 1: User Profile + Search Decision */}
                                  <div className="border border-blue-700/50 rounded-lg bg-blue-900/10">
                                      <div className="bg-blue-800/30 px-3 py-2 border-b border-blue-700/50">
                                          <span className="text-blue-300 font-bold">Stage 1: User Profile + Search Decision</span>
                                      </div>
                                      <div className="p-3 space-y-3">
                                          <div>
                                              <div className="text-[10px] text-slate-400 mb-1">Prompt:</div>
                                              <div className="text-[10px] text-blue-100/90 whitespace-pre-wrap bg-black/30 p-2 rounded border border-blue-900/30 max-h-48 overflow-y-auto font-mono">
                                                  {processState.currentDebugInfo.unified_pipeline.stage1_prompt || "Waiting..."}
                                              </div>
                                          </div>
                                          {processState.currentDebugInfo.unified_pipeline.stage1_output && (
                                              <div>
                                                  <div className="text-[10px] text-green-400 mb-1">Output:</div>
                                                  <div className="text-[10px] text-green-100/90 whitespace-pre-wrap bg-green-950/30 p-2 rounded border border-green-900/30 max-h-48 overflow-y-auto font-mono">
                                                      {JSON.stringify(processState.currentDebugInfo.unified_pipeline.stage1_output, null, 2)}
                                                  </div>
                                              </div>
                                          )}
                                      </div>
                                  </div>

                                  {/* Stage 2: Recall */}
                                  <div className="border border-purple-700/50 rounded-lg bg-purple-900/10">
                                      <div className="bg-purple-800/30 px-3 py-2 border-b border-purple-700/50">
                                          <span className="text-purple-300 font-bold">Stage 2: Recall</span>
                                      </div>
                                      <div className="p-3 space-y-3">
                                          <div>
                                              <div className="text-[10px] text-slate-400 mb-1">Prompt:</div>
                                              <div className="text-[10px] text-purple-100/90 whitespace-pre-wrap bg-black/30 p-2 rounded border border-purple-900/30 max-h-48 overflow-y-auto font-mono">
                                                  {processState.currentDebugInfo.unified_pipeline.stage2_prompt || "Waiting..."}
                                              </div>
                                          </div>
                                          {processState.currentDebugInfo.unified_pipeline.stage2_output && (
                                              <div>
                                                  <div className="text-[10px] text-green-400 mb-1">Output:</div>
                                                  <div className="text-[10px] text-green-100/90 whitespace-pre-wrap bg-green-950/30 p-2 rounded border border-green-900/30 max-h-48 overflow-y-auto font-mono">
                                                      {JSON.stringify(processState.currentDebugInfo.unified_pipeline.stage2_output, null, 2)}
                                                  </div>
                                              </div>
                                          )}
                                      </div>
                                  </div>

                                  {/* Stage 3: Quality Filter */}
                                  <div className="border border-yellow-700/50 rounded-lg bg-yellow-900/10">
                                      <div className="bg-yellow-800/30 px-3 py-2 border-b border-yellow-700/50">
                                          <span className="text-yellow-300 font-bold">Stage 3: Quality Filter</span>
                                      </div>
                                      <div className="p-3 space-y-3">
                                          <div>
                                              <div className="text-[10px] text-slate-400 mb-1">Prompt:</div>
                                              <div className="text-[10px] text-yellow-100/90 whitespace-pre-wrap bg-black/30 p-2 rounded border border-yellow-900/30 max-h-48 overflow-y-auto font-mono">
                                                  {processState.currentDebugInfo.unified_pipeline.stage3_prompt || "Waiting..."}
                                              </div>
                                          </div>
                                          {processState.currentDebugInfo.unified_pipeline.stage3_output && (
                                              <div>
                                                  <div className="text-[10px] text-green-400 mb-1">Output:</div>
                                                  <div className="text-[10px] text-green-100/90 whitespace-pre-wrap bg-green-950/30 p-2 rounded border border-green-900/30 max-h-48 overflow-y-auto font-mono">
                                                      {JSON.stringify(processState.currentDebugInfo.unified_pipeline.stage3_output, null, 2)}
                                                  </div>
                                              </div>
                                          )}
                                      </div>
                                  </div>

                                  {/* Stage 4: Fine Ranking */}
                                  <div className="border border-emerald-700/50 rounded-lg bg-emerald-900/10">
                                      <div className="bg-emerald-800/30 px-3 py-2 border-b border-emerald-700/50">
                                          <span className="text-emerald-300 font-bold">Stage 4: Fine Ranking</span>
                                      </div>
                                      <div className="p-3 space-y-3">
                                          <div>
                                              <div className="text-[10px] text-slate-400 mb-1">Prompt:</div>
                                              <div className="text-[10px] text-emerald-100/90 whitespace-pre-wrap bg-black/30 p-2 rounded border border-emerald-900/30 max-h-48 overflow-y-auto font-mono">
                                                  {processState.currentDebugInfo.unified_pipeline.stage4_prompt || "Waiting..."}
                                              </div>
                                          </div>
                                          {processState.currentDebugInfo.unified_pipeline.stage4_output && (
                                              <div>
                                                  <div className="text-[10px] text-green-400 mb-1">Output:</div>
                                                  <div className="text-[10px] text-green-100/90 whitespace-pre-wrap bg-green-950/30 p-2 rounded border border-green-900/30 max-h-48 overflow-y-auto font-mono">
                                                      {JSON.stringify(processState.currentDebugInfo.unified_pipeline.stage4_output, null, 2)}
                                                  </div>
                                              </div>
                                          )}
                                      </div>
                                  </div>
                              </>
                          )}
                      </div>
                 )}
                 {activeTab === 'interactions' && (
                      <div className="leading-relaxed p-4 space-y-2">
                          {!processState.currentDebugInfo?.rawInteractions || processState.currentDebugInfo.rawInteractions.length === 0 ? (
                              <div className="text-slate-500 italic text-center py-8">
                                  暂无交互记录...
                              </div>
                          ) : (
                              <>
                                  <div className="text-slate-400 mb-3 text-[10px]">
                                      共 {processState.currentDebugInfo.rawInteractions.length} 条交互记录
                                  </div>
                                  {processState.currentDebugInfo.rawInteractions.map((interaction: any, index: number) => {
                                      const isExpanded = expandedInteractionIndex === index;
                                      const action = interaction.clicked ? 'CLICKED' : 'SKIPPED';
                                      const actionColor = interaction.clicked ? 'text-green-400' : 'text-slate-500';

                                      return (
                                          <div key={index} className="border border-slate-700 rounded-lg bg-slate-800/30 overflow-hidden">
                                              {/* Summary Line (Clickable) */}
                                              <div
                                                  onClick={() => setExpandedInteractionIndex(isExpanded ? null : index)}
                                                  className="p-2 cursor-pointer hover:bg-slate-700/50 transition-colors flex items-center justify-between"
                                              >
                                                  <div className="flex-1 flex items-center gap-2 text-[10px]">
                                                      <span className="text-slate-500">#{index + 1}</span>
                                                      <span className={`font-bold ${actionColor}`}>{action}</span>
                                                      <span className="text-slate-300 truncate max-w-[200px]">
                                                          {interaction.articleContext?.title || 'Unknown'}
                                                      </span>
                                                      {interaction.clicked && (
                                                          <>
                                                              <span className="text-slate-500">|</span>
                                                              <span className="text-cyan-400">{interaction.dwellTime}s</span>
                                                              <span className="text-purple-400">{Math.round(interaction.scrollDepth * 100)}%</span>
                                                          </>
                                                      )}
                                                      {interaction.liked && <span className="text-pink-400">♥</span>}
                                                      {interaction.comment && <span className="text-yellow-400">💬</span>}
                                                  </div>
                                                  <span className="text-slate-500 text-[10px]">
                                                      {isExpanded ? '▼' : '▶'}
                                                  </span>
                                              </div>

                                              {/* Expanded JSON Details */}
                                              {isExpanded && (
                                                  <div className="border-t border-slate-700 p-2 bg-black/20">
                                                      <pre className="text-[9px] text-slate-300 whitespace-pre-wrap overflow-x-auto">
                                                          {JSON.stringify(interaction, null, 2)}
                                                      </pre>
                                                  </div>
                                              )}
                                          </div>
                                      );
                                  })}
                              </>
                          )}
                      </div>
                 )}
             </div>
        </div>
    );
};
