
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
                          {(() => {
                              const interactions = processState.currentDebugInfo?.rawInteractions || [];

                              if (interactions.length === 0) {
                                  return (
                                      <div className="text-slate-500 italic text-center py-8">
                                          暂无交互记录（模型将收到空的交互历史）
                                      </div>
                                  );
                              }

                              // 按 sessionId 分组，保持原有顺序
                              const sessionGroups = new Map<string, any[]>();
                              interactions.forEach((i: any) => {
                                  const sid = i.sessionId || 'unknown';
                                  if (!sessionGroups.has(sid)) {
                                      sessionGroups.set(sid, []);
                                  }
                                  sessionGroups.get(sid)!.push(i);
                              });

                              // 统计
                              const clickedCount = interactions.filter((i: any) => i.clicked).length;
                              const skippedCount = interactions.filter((i: any) => !i.clicked).length;

                              return (
                                  <>
                                      <div className="text-slate-400 mb-3 text-[10px] border-b border-slate-700 pb-2">
                                          <div className="flex justify-between mb-1">
                                              <span>📊 传给模型的交互数据（最近 {Math.min(30, interactions.length)} 条）</span>
                                          </div>
                                          <div className="flex gap-4 text-[9px]">
                                              <span className="text-green-400">CLICKED: {clickedCount}</span>
                                              <span className="text-slate-500">SKIPPED: {skippedCount}</span>
                                              <span>共 {sessionGroups.size} 个 Session</span>
                                          </div>
                                      </div>

                                      {Array.from(sessionGroups.entries()).map(([sessionId, sessionInteractions], groupIndex) => (
                                          <div key={sessionId} className="border border-slate-700 rounded-lg overflow-hidden mb-3">
                                              {/* Session Header */}
                                              <div className="bg-slate-800/80 px-3 py-1.5 text-[10px] flex justify-between items-center border-b border-slate-700">
                                                  <span className="text-cyan-400 font-bold">
                                                      Session {groupIndex + 1}
                                                  </span>
                                                  <span className="text-slate-500 text-[9px]">
                                                      {sessionId.slice(0, 20)}...
                                                  </span>
                                              </div>

                                              {/* Interactions in Session (模型接收格式) */}
                                              <div className="divide-y divide-slate-800">
                                                  {sessionInteractions.map((interaction: any, index: number) => {
                                                      const action = interaction.clicked ? 'CLICKED_AND_VIEWED' : 'SKIPPED_IN_FEED';
                                                      const actionColor = interaction.clicked ? 'text-green-400' : 'text-slate-500';

                                                      return (
                                                          <div
                                                              key={interaction.id || index}
                                                              className="p-2 text-[10px] hover:bg-slate-800/50"
                                                          >
                                                              {/* 模型接收的格式展示 */}
                                                              <div className="flex items-start gap-2">
                                                                  <span className="text-slate-600 w-5 shrink-0">#{index + 1}</span>
                                                                  <div className="flex-1 min-w-0">
                                                                      {/* article 部分 */}
                                                                      <div className="text-slate-300 truncate mb-1">
                                                                          {interaction.articleContext?.title || 'Unknown'}
                                                                      </div>
                                                                      {/* behavior 部分 */}
                                                                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px]">
                                                                          <span className={`font-bold ${actionColor}`}>{action}</span>
                                                                          {interaction.clicked && (
                                                                              <>
                                                                                  <span className="text-cyan-400">
                                                                                      ⏱ {interaction.dwellTime}s
                                                                                  </span>
                                                                                  <span className="text-purple-400">
                                                                                      📜 {Math.round(interaction.scrollDepth * 100)}%
                                                                                  </span>
                                                                              </>
                                                                          )}
                                                                          {interaction.liked && <span className="text-pink-400">♥ liked</span>}
                                                                          {interaction.favorited && <span className="text-yellow-400">⭐ favorited</span>}
                                                                          {interaction.comment && (
                                                                              <span className="text-orange-400">💬 "{interaction.comment.slice(0, 20)}..."</span>
                                                                          )}
                                                                      </div>
                                                                      {/* tags */}
                                                                      {interaction.articleContext?.tags?.length > 0 && (
                                                                          <div className="text-[9px] text-slate-500 mt-1 truncate">
                                                                              🏷 {interaction.articleContext.tags.slice(0, 5).join(', ')}
                                                                          </div>
                                                                      )}
                                                                  </div>
                                                              </div>
                                                          </div>
                                                      );
                                                  })}
                                              </div>
                                          </div>
                                      ))}
                                  </>
                              );
                          })()}
                      </div>
                 )}
             </div>
        </div>
    );
};
