
import React, { useState } from 'react';
import { ProcessState } from '../types';
import { FIXED_STRATEGY_PREAMBLE, FIXED_CONTENT_PREAMBLE } from '../services/geminiService';

interface Props {
    processState: ProcessState;
    onClose?: () => void;
}

export const TracePopover: React.FC<Props> = ({ processState, onClose }) => {
    const [activeTab, setActiveTab] = useState<'log' | 'strategy' | 'content'>('log');

    // Helper to render the colorful history visualization
    const renderHistoryVisualization = (interactions: any[]) => {
        if (!interactions || !Array.isArray(interactions)) return <div className="text-slate-500 italic p-2">Waiting for history data...</div>;

        return (
            <div className="space-y-3 pl-2 border-l-2 border-slate-700 ml-1 my-2">
                {interactions.map((session, sIdx) => (
                    <div key={sIdx} className="bg-slate-800/50 rounded p-2 border border-slate-700">
                         <div className="text-[10px] text-indigo-400 font-bold mb-2 uppercase tracking-wider flex justify-between">
                            <span>SESSION: {session.session_id}</span>
                            <span className="text-slate-600">Items: {session.interactions?.length}</span>
                         </div>
                         <div className="space-y-2">
                             {session.interactions?.map((item: any, iIdx: number) => (
                                 <div key={iIdx} className="bg-black/20 p-2 rounded text-[10px] grid grid-cols-12 gap-2">
                                     <div className="col-span-8 text-slate-300">
                                         <span className="text-slate-500 mr-1">Title:</span> 
                                         <span className="font-medium text-slate-200">{item.article_context?.title}</span>
                                     </div>
                                     <div className="col-span-4 text-right">
                                         <span className={`font-bold px-1 rounded ${item.user_behavior?.action === 'CLICKED_AND_VIEWED' ? 'bg-green-900/50 text-green-400' : 'bg-slate-700 text-slate-400'}`}>
                                            {item.user_behavior?.action === 'CLICKED_AND_VIEWED' ? 'VIEWED' : 'SKIPPED'}
                                         </span>
                                     </div>
                                     {item.user_behavior?.action === 'CLICKED_AND_VIEWED' && (
                                         <div className="col-span-12 flex gap-3 text-slate-500 border-t border-slate-700/50 pt-1 mt-1">
                                             <span>⏱ {item.user_behavior.time_spent_seconds}s</span>
                                             <span>📜 {item.user_behavior.read_percentage}</span>
                                             {item.user_behavior.interactions?.liked && <span className="text-pink-400">♥ Liked</span>}
                                             {item.user_behavior.interactions?.comment && <span className="text-yellow-400">💬 "{item.user_behavior.interactions.comment}"</span>}
                                         </div>
                                     )}
                                 </div>
                             ))}
                         </div>
                    </div>
                ))}
            </div>
        );
    };

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
                    onClick={() => setActiveTab('strategy')}
                    className={`flex-1 py-2 text-center transition-colors ${activeTab === 'strategy' ? 'bg-slate-700 text-yellow-400' : 'text-slate-400 hover:text-slate-200'}`}
                 >
                    Strategy Input
                 </button>
                 <button 
                    onClick={() => setActiveTab('content')}
                    className={`flex-1 py-2 text-center transition-colors ${activeTab === 'content' ? 'bg-slate-700 text-emerald-400' : 'text-slate-400 hover:text-slate-200'}`}
                 >
                    Content Input
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
                 {activeTab === 'strategy' && (
                      <div className="leading-relaxed p-4">
                          <div className="text-slate-500 mb-2 font-bold">[Fixed Preamble]</div>
                          <div className="text-slate-400 whitespace-pre-wrap mb-4 bg-black/20 p-2 rounded max-h-40 overflow-y-auto">{FIXED_STRATEGY_PREAMBLE}</div>
                          
                          <div className="text-indigo-400 mb-2 font-bold">[Injected History]</div>
                          {renderHistoryVisualization(processState.currentDebugInfo?.rawInteractions)}
                          
                          <div className="text-yellow-400 mb-2 font-bold mt-4">[Task Prompt]</div>
                          <div className="text-yellow-100/90 whitespace-pre-wrap bg-yellow-900/10 p-2 rounded border border-yellow-900/30">
                              {processState.currentDebugInfo?.strategyPrompt 
                                ? processState.currentDebugInfo.strategyPrompt.split(FIXED_STRATEGY_PREAMBLE.split('\n')[0])[1] || "..." 
                                : "Waiting..."}
                          </div>
                      </div>
                 )}
                 {activeTab === 'content' && (
                      <div className="leading-relaxed p-4">
                          <div className="text-slate-500 mb-2 font-bold">[Fixed Preamble]</div>
                          <div className="text-slate-400 whitespace-pre-wrap mb-4 bg-black/20 p-2 rounded max-h-40 overflow-y-auto">{FIXED_CONTENT_PREAMBLE}</div>

                          <div className="text-indigo-400 mb-2 font-bold">[Injected History]</div>
                          {renderHistoryVisualization(processState.currentDebugInfo?.rawInteractions)}

                          <div className="text-emerald-400 mb-2 font-bold mt-4">[Task Prompt]</div>
                          <div className="text-emerald-100/90 whitespace-pre-wrap bg-emerald-900/10 p-2 rounded border border-emerald-900/30">
                              {processState.currentDebugInfo?.contentPrompt 
                                ? processState.currentDebugInfo.contentPrompt.split(FIXED_CONTENT_PREAMBLE.split('\n')[0])[1] || "..." 
                                : "Waiting..."}
                          </div>
                      </div>
                 )}
             </div>
        </div>
    );
};
