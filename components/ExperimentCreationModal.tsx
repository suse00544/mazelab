import React, { useState, useEffect } from 'react';
import { ExperimentMode } from '../types';
import { db } from '../services/db';

interface Props {
  userId: string;
  onClose: () => void;
  onCreate: (experiment: {
    name: string;
    mode: ExperimentMode;
  }) => void;
}

export const ExperimentCreationModal: React.FC<Props> = ({ userId, onClose, onCreate }) => {
  const [experimentName, setExperimentName] = useState('');
  const [selectedMode, setSelectedMode] = useState<ExperimentMode>('solo');

  useEffect(() => {
    generateDefaultName();
  }, []);

  const generateDefaultName = async () => {
    const exps = await db.getUserExperiments(userId);
    setExperimentName(`实验 #${exps.length + 1}`);
  };

  const handleCreate = () => {
    if (!experimentName.trim()) {
      alert('请输入实验名称');
      return;
    }

    onCreate({
      name: experimentName.trim(),
      mode: selectedMode
    });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-2xl font-bold text-slate-900">创建新实验</h2>
          <p className="text-sm text-slate-600 mt-1">配置实验参数和推荐策略</p>
        </div>

        <div className="p-6 space-y-6">
          {/* 1. 实验名称 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              1. 实验名称 *
            </label>
            <input
              type="text"
              value={experimentName}
              onChange={(e) => setExperimentName(e.target.value)}
              placeholder="例如：探索推荐算法"
              className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {/* 2. 实验模式 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              2. 实验模式 *
            </label>

            <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg text-xs text-blue-800 mb-3">
              <strong>💡 说明：</strong>
              <br/>
              • 每个实验有独立的个人库（创建时为空，需手动添加 ≥20 篇内容）
              <br/>
              • 冷启动（第一刷）始终展示个人库全部内容
              <br/>
              • Solo 模式：后续推荐仅使用个人库 | Community 模式：后续推荐使用社区库
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Solo 模式 */}
              <div
                onClick={() => setSelectedMode('solo')}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  selectedMode === 'solo'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-slate-200 hover:border-indigo-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="radio"
                    checked={selectedMode === 'solo'}
                    onChange={() => setSelectedMode('solo')}
                    className="w-4 h-4"
                  />
                  <span className="font-semibold text-slate-900">Solo 模式</span>
                </div>
                <p className="text-sm text-slate-600 ml-6">
                  冷启动和后续推荐均使用本实验的独立个人库
                </p>
              </div>

              {/* Community 模式 */}
              <div
                onClick={() => setSelectedMode('community')}
                className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                  selectedMode === 'community'
                    ? 'border-green-500 bg-green-50'
                    : 'border-slate-200 hover:border-green-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="radio"
                    checked={selectedMode === 'community'}
                    onChange={() => setSelectedMode('community')}
                    className="w-4 h-4"
                  />
                  <span className="font-semibold text-slate-900">Community 模式</span>
                </div>
                <p className="text-sm text-slate-600 ml-6">
                  冷启动使用个人库，后续推荐使用社区共享内容池
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="p-6 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-6 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            取消
          </button>
          <button
            onClick={handleCreate}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
          >
            创建实验
          </button>
        </div>
      </div>
    </div>
  );
};
