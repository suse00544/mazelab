import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { Experiment, User } from '../types';

interface Props {
  user: User;
  onClose: () => void;
  onSelectExperiment: (exp: Experiment) => void;
}

export const HistoryModal: React.FC<Props> = ({ user, onClose, onSelectExperiment }) => {
  const [experiments, setExperiments] = useState<Experiment[]>([]);

  useEffect(() => {
    const load = async () => {
        const exps = await db.getUserExperiments(user.id);
        setExperiments(exps);
    };
    load();
  }, [user.id]);

  const handleSelect = async (exp: Experiment) => {
    await db.activateExperiment(exp.id, user.id);
    onSelectExperiment(exp);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h2 className="font-bold text-slate-800 text-lg">实验历史记录</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {experiments.length === 0 ? <div className="text-center text-slate-400 py-10">暂无实验记录</div> : experiments.map((exp) => (
              <button key={exp.id} onClick={() => handleSelect(exp)} className={`w-full text-left p-4 rounded-lg border transition-all hover:shadow-md ${exp.active ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-slate-200 bg-white hover:border-indigo-300'}`}>
                <div className="flex justify-between items-start mb-1">
                  <span className="font-bold text-slate-800">{exp.name}</span>
                  {exp.active && <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full">进行中</span>}
                </div>
                <div className="text-xs text-slate-500 font-mono">ID: {exp.id}</div>
                <div className="text-xs text-slate-400 mt-2">开始时间: {new Date(exp.startTimestamp).toLocaleString()}</div>
              </button>
          ))}
        </div>
      </div>
    </div>
  );
};