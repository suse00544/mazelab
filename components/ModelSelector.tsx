
import React, { useState, useEffect } from 'react';
import { checkModelHealth } from '../services/geminiService';

export const MODELS = [
    { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash (Stable)' },
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
    { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Preview)' },
];

interface Props {
    selectedModel: string;
    onSelect: (model: string) => void;
}

export const ModelSelector: React.FC<Props> = ({ selectedModel, onSelect }) => {
    const [healthStatus, setHealthStatus] = useState<'checking' | 'ok' | 'error'>('checking');
    const [isOpen, setIsOpen] = useState(false);
    const [showApiKeyModal, setShowApiKeyModal] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [tempApiKey, setTempApiKey] = useState('');

    // 加载缓存的 API key
    useEffect(() => {
        const cachedKey = localStorage.getItem('GEMINI_API_KEY');
        if (cachedKey) {
            setApiKey(cachedKey);
        }
    }, []);

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

    const handleSaveApiKey = () => {
        localStorage.setItem('GEMINI_API_KEY', tempApiKey);
        setApiKey(tempApiKey);
        setShowApiKeyModal(false);
        setTempApiKey('');
        // 重新检查健康状态
        setHealthStatus('checking');
        checkModelHealth(selectedModel).then(isOk => {
            setHealthStatus(isOk ? 'ok' : 'error');
        });
    };

    const handleOpenApiKeyModal = () => {
        setTempApiKey(apiKey);
        setShowApiKeyModal(true);
        setIsOpen(false);
    };

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
                        <div className="border-t border-slate-700 mt-1 pt-1">
                            <button
                                onClick={handleOpenApiKeyModal}
                                className="w-full text-left px-4 py-2 text-xs hover:bg-slate-700 text-slate-400 flex items-center gap-2"
                            >
                                <span>🔑</span>
                                <span>配置 API Key</span>
                                {apiKey && <span className="text-green-400 text-[10px]">✓</span>}
                            </button>
                        </div>
                    </div>
                </>
            )}

            {/* API Key 配置弹窗 */}
            {showApiKeyModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-md p-6">
                        <h3 className="text-lg font-bold text-slate-900 mb-4">配置 Gemini API Key</h3>

                        <div className="mb-4">
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                API Key
                            </label>
                            <input
                                type="password"
                                value={tempApiKey}
                                onChange={(e) => setTempApiKey(e.target.value)}
                                placeholder="输入你的 Gemini API Key"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <p className="mt-2 text-xs text-slate-500">
                                API Key 将保存在浏览器本地存储中。获取 API Key:
                                <a
                                    href="https://aistudio.google.com/app/apikey"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline ml-1"
                                >
                                    Google AI Studio
                                </a>
                            </p>
                        </div>

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={() => {
                                    setShowApiKeyModal(false);
                                    setTempApiKey('');
                                }}
                                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleSaveApiKey}
                                disabled={!tempApiKey.trim()}
                                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                保存
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
