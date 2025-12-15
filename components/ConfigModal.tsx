
import React, { useState } from 'react';
import { db } from '../services/db';
import { FIXED_STRATEGY_PREAMBLE, FIXED_CONTENT_PREAMBLE } from '../services/geminiService';

interface Props {
  initialStrategyPrompt: string;
  initialContentPrompt: string;
  experimentId?: string; // Optional: If provided, updates specific experiment too
  onClose: () => void;
  onSave: (strategy: string, content: string) => void;
}

export const ConfigModal: React.FC<Props> = ({ initialStrategyPrompt, initialContentPrompt, experimentId, onClose, onSave }) => {
    const [strategyPrompt, setStrategyPrompt] = useState(initialStrategyPrompt);
    const [contentPrompt, setContentPrompt] = useState(initialContentPrompt);

    const handleSave = () => {
        // 1. Always update Global Config (Persist for future new experiments)
        db.saveGlobalConfig(strategyPrompt, contentPrompt);

        // 2. If editing an active experiment, update it specifically (Hot update)
        if (experimentId) {
            db.updateExperimentConfig(experimentId, strategyPrompt, contentPrompt);
        }

        // 3. Notify parent to update local state
        onSave(strategyPrompt, contentPrompt);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full flex flex-col max-h-[95vh]">
                <div className="p-5 border-b flex justify-between items-center bg-slate-50 rounded-t-xl shrink-0">
                    <div>
                        <h2 className="font-bold text-slate-800 text-lg">实验配置 (Prompt Tuning)</h2>
                        <p className="text-slate-500 text-xs">
                            {experimentId ? `正在编辑当前实验: ${experimentId}` : '正在编辑全局默认模板 (将应用于新实验)'}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl">×</button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg text-sm text-amber-800 mb-2">
                        <strong>注意：</strong>
                        系统已锁定上下文注入部分（User Role + History Injection + Candidate Set Injection）。
                        <br/>
                        请专注于修改下方的<strong>“任务指令 (Task)”</strong>部分。
                        <br/>
                        修改保存后，新配置将应用于<strong>所有新创建的实验</strong>{experimentId && ' 以及当前实验的下一刷'}。
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 h-full">
                         {/* 1. Strategy Column */}
                         <div className="flex flex-col h-full gap-2">
                             <div className="flex items-center gap-2 mb-1">
                                 <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                                 <h3 className="text-sm font-bold text-slate-700">1. Strategy Prompt (策略分析)</h3>
                             </div>
                             
                             {/* Read-only Context */}
                             <div className="bg-slate-100 border border-slate-300 rounded-t-lg p-3 text-[10px] text-slate-500 font-mono leading-tight select-none">
                                 <div className="mb-1 font-bold text-slate-400 uppercase">Fixed Context (Read-only)</div>
                                 <pre className="whitespace-pre-wrap">{FIXED_STRATEGY_PREAMBLE}</pre>
                             </div>

                             {/* Editable Task */}
                             <textarea 
                                value={strategyPrompt}
                                onChange={e => setStrategyPrompt(e.target.value)}
                                className="flex-1 min-h-[400px] w-full border border-slate-300 border-t-0 rounded-b-lg p-3 font-mono text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed bg-white resize-y shadow-inner"
                                placeholder="在这里编写具体的分析任务指令..."
                             />
                         </div>

                         {/* 2. Content Column */}
                         <div className="flex flex-col h-full gap-2">
                             <div className="flex items-center gap-2 mb-1">
                                 <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                                 <h3 className="text-sm font-bold text-slate-700">2. Content Selection Prompt (内容精排)</h3>
                             </div>

                             {/* Read-only Context */}
                             <div className="bg-slate-100 border border-slate-300 rounded-t-lg p-3 text-[10px] text-slate-500 font-mono leading-tight select-none">
                                 <div className="mb-1 font-bold text-slate-400 uppercase">Fixed Context (Read-only)</div>
                                 <pre className="whitespace-pre-wrap">{FIXED_CONTENT_PREAMBLE}</pre>
                             </div>

                             {/* Editable Task */}
                             <textarea 
                                value={contentPrompt}
                                onChange={e => setContentPrompt(e.target.value)}
                                className="flex-1 min-h-[400px] w-full border border-slate-300 border-t-0 rounded-b-lg p-3 font-mono text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed bg-white resize-y shadow-inner"
                                placeholder="在这里编写具体的选品任务指令..."
                             />
                         </div>
                    </div>
                </div>

                <div className="p-5 border-t bg-slate-50 rounded-b-xl flex justify-end gap-3 shrink-0">
                    <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium">取消</button>
                    <button onClick={handleSave} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 shadow-sm">保存任务配置</button>
                </div>
            </div>
        </div>
    );
};
