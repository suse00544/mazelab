import React, { useEffect, useState } from 'react';
import { db } from '../services/db';
import { Experiment, User } from '../types';

interface Props {
  user: User;
  currentExperimentId?: string;
  onClose: () => void;
  onSelectExperiment: (exp: Experiment) => void;
  onExperimentDeleted?: (deletedExpId: string) => void;
}

export const HistoryModal: React.FC<Props> = ({ user, currentExperimentId, onClose, onSelectExperiment, onExperimentDeleted }) => {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadExperiments();
  }, [user.id]);

  const loadExperiments = async () => {
    const exps = await db.getUserExperiments(user.id);
    setExperiments(exps);
  };

  const handleSelect = async (exp: Experiment) => {
    await db.activateExperiment(exp.id, user.id);
    onSelectExperiment(exp);
  };

  const handleDelete = async (e: React.MouseEvent, exp: Experiment) => {
    e.stopPropagation();

    setDeletingId(exp.id);
    try {
      await db.deleteExperiment(exp.id);

      // 如果删除的是当前实验，通知父组件
      if (exp.id === currentExperimentId) {
        onExperimentDeleted?.(exp.id);
      }

      // 刷新列表
      await loadExperiments();
    } catch (err: any) {
      alert('删除失败: ' + err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 border-b flex justify-between items-center bg-slate-50">
          <h2 className="font-bold text-slate-800 text-lg">实验历史记录</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {experiments.length === 0 ? (
            <div className="text-center text-slate-400 py-10">暂无实验记录</div>
          ) : (
            experiments.map((exp) => (
              <div
                key={exp.id}
                className={`relative w-full text-left p-4 rounded-lg border transition-all hover:shadow-md ${
                  exp.active ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'border-slate-200 bg-white hover:border-indigo-300'
                }`}
              >
                <div className="flex justify-between items-start gap-3">
                  {/* 左侧：实验信息（可点击选择） */}
                  <div
                    className="flex-1 cursor-pointer"
                    onClick={() => handleSelect(exp)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-slate-800">{exp.name}</span>
                      {exp.active && <span className="bg-indigo-600 text-white text-[10px] px-2 py-0.5 rounded-full">进行中</span>}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">ID: {exp.id}</div>
                    <div className="text-xs text-slate-400 mt-1">开始: {new Date(exp.startTimestamp).toLocaleString()}</div>
                    <div className="text-xs text-slate-400">模式: {exp.mode === 'solo' ? 'Solo' : 'Community'}</div>
                  </div>

                  {/* 右侧：删除按钮 */}
                  <button
                    onClick={(e) => handleDelete(e, exp)}
                    disabled={deletingId === exp.id}
                    className="shrink-0 px-3 py-2 text-red-500 hover:text-white hover:bg-red-500 border border-red-300 hover:border-red-500 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    title="删除实验"
                  >
                    {deletingId === exp.id ? (
                      <span className="w-5 h-5 border-2 border-red-300 border-t-red-500 rounded-full animate-spin inline-block" />
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
