
import React, { useState, useEffect } from 'react';
import { checkModelHealth } from '../services/geminiService';

export const MODELS = [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Stable)' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
];

interface Props {
    selectedModel: string;
    onSelect: (model: string) => void;
}

export const ModelSelector: React.FC<Props> = ({ selectedModel, onSelect }) => {
    const [healthStatus, setHealthStatus] = useState<'checking' | 'ok' | 'error'>('checking');
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        let mounted = true;
        const check = async () => {
            setHealthStatus('checking');
            const isOk = await checkModelHealth(selectedModel);
            if (mounted) {
                setHealthStatus(isOk ? 'ok' : 'error');
            }
        };
        check();
        return () => { mounted = false; };
    }, [selectedModel]);

    return (
        <div className="relative z-50">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded border border-slate-700 transition-colors"
            >
                <div className={`w-2 h-2 rounded-full ${healthStatus === 'ok' ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.6)]' : healthStatus === 'checking' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-xs font-mono text-slate-300">
                    {MODELS.find(m => m.id === selectedModel)?.name || selectedModel}
                </span>
                <span className="text-slate-500 text-[10px]">▼</span>
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
                    <div className="absolute top-full right-0 mt-2 w-56 bg-slate-800 border border-slate-700 rounded shadow-xl z-50 overflow-hidden">
                        {MODELS.map(m => (
                            <button
                                key={m.id}
                                onClick={() => {
                                    onSelect(m.id);
                                    setIsOpen(false);
                                }}
                                className={`w-full text-left px-4 py-2 text-xs hover:bg-slate-700 flex items-center justify-between ${selectedModel === m.id ? 'text-white bg-slate-700/50' : 'text-slate-400'}`}
                            >
                                <span>{m.name}</span>
                                {selectedModel === m.id && <span className="text-emerald-400">✓</span>}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};
