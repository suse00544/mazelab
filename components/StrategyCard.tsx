
import React from 'react';
import { RecommendationStrategy } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface Props {
  strategy: RecommendationStrategy;
  roundIndex: number;
}

export const StrategyCard: React.FC<Props> = ({ strategy, roundIndex }) => {
    if (!strategy) return null;
    
    const { user_profile, recommendation_strategy, detailed_reasoning } = strategy;

    const chartData = [
        { name: '个性化', value: (recommendation_strategy.personalization_ratio || 0) * 100, color: '#4f46e5' },
        { name: '探索', value: (recommendation_strategy.exploration_ratio || 0) * 100, color: '#0ea5e9' },
        { name: '惊喜', value: (recommendation_strategy.serendipity_ratio || 0) * 100, color: '#f59e0b' },
    ];

    return (
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden mb-8 border-l-4 border-l-indigo-600">
            <div className="bg-slate-50 border-b border-slate-100 p-4 flex justify-between items-center">
                 <h3 className="font-bold text-slate-800 flex items-center gap-2">
                     <span className="text-xl">🧠</span>
                     <span>AI 策略分析</span>
                     <span className="bg-slate-200 text-slate-600 text-[10px] px-2 py-0.5 rounded-full uppercase">Round {roundIndex}</span>
                 </h3>
                 <span className="text-xs text-slate-400">仅供研究者参考</span>
            </div>
            
            <div className="p-6 grid gap-6">
                {/* 1. Profile Summary */}
                <div>
                     <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">用户画像推断</span>
                     <p className="text-slate-800 font-medium leading-relaxed bg-indigo-50/50 p-3 rounded-lg border border-indigo-50">
                        {user_profile.interests_summary}
                     </p>
                </div>

                {/* 2. Charts & Strategy */}
                <div className="grid md:grid-cols-2 gap-6 items-center">
                    <div className="h-32 w-full">
                         <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 30, left: 0, bottom: 0 }}>
                                <XAxis type="number" domain={[0, 100]} hide />
                                <YAxis dataKey="name" type="category" width={50} tick={{fontSize: 10, fontWeight: 600, fill: '#64748b'}} />
                                <Tooltip cursor={{fill: 'transparent'}} contentStyle={{fontSize: '12px', padding: '4px 8px'}} />
                                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={16} label={{ position: 'right', fill: '#64748b', fontSize: 10, formatter: (v:number) => `${v}%` }}>
                                    {chartData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="text-sm space-y-2">
                        <div>
                             <span className="text-indigo-600 font-bold">个性化:</span>
                             <span className="text-slate-600 ml-2">{recommendation_strategy.personalized_approach}</span>
                        </div>
                        <div>
                             <span className="text-sky-600 font-bold">探索:</span>
                             <span className="text-slate-600 ml-2">{recommendation_strategy.exploration_approach}</span>
                        </div>
                    </div>
                </div>
                
                {/* 3. Reasoning */}
                <div className="text-sm border-t border-slate-100 pt-4 mt-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">思考过程</span>
                    <p className="text-slate-500 italic">"{detailed_reasoning.why_personalized}"</p>
                </div>
            </div>
        </div>
    );
};
