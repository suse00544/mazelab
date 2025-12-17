
import React, { useState } from 'react';
import { db } from '../services/db';
import { Experiment } from '../types';
import {
  FIXED_KEYWORD_COLD_START_PREAMBLE,
  FIXED_KEYWORD_INTERACTION_PREAMBLE,
  DEFAULT_KEYWORD_COLD_START_TASK,
  DEFAULT_KEYWORD_INTERACTION_TASK
} from '../services/autoCrawlService';
import {
  STAGE1_SYSTEM_PROMPT,
  STAGE1_DEFAULT_USER_PROMPT,
  STAGE2_SYSTEM_PROMPT,
  STAGE2_DEFAULT_USER_PROMPT,
  STAGE3_SYSTEM_PROMPT,
  STAGE3_DEFAULT_USER_PROMPT,
  STAGE4_SYSTEM_PROMPT,
  STAGE4_DEFAULT_USER_PROMPT,
  DEFAULT_RECOMMENDATION_CONFIG
} from '../services/defaultPrompts';

interface Props {
  experiment?: Experiment;
  onClose: () => void;
  onSave: (updates: Partial<Experiment>) => void;
}

type TabType = 'recommendation' | 'keyword';

export const ConfigModal: React.FC<Props> = ({
  experiment,
  onClose,
  onSave
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('recommendation');
  const [activeStage, setActiveStage] = useState<1 | 2 | 3 | 4>(1);

  // 四阶段推荐 Prompt 状态
  const [stage1Prompt, setStage1Prompt] = useState(
    experiment?.stage1_custom_prompt || STAGE1_DEFAULT_USER_PROMPT
  );
  const [stage2Prompt, setStage2Prompt] = useState(
    experiment?.stage2_custom_prompt || STAGE2_DEFAULT_USER_PROMPT
  );
  const [stage3Prompt, setStage3Prompt] = useState(
    experiment?.stage3_custom_prompt || STAGE3_DEFAULT_USER_PROMPT
  );
  const [stage4Prompt, setStage4Prompt] = useState(
    experiment?.stage4_custom_prompt || STAGE4_DEFAULT_USER_PROMPT
  );

  // 推荐配置参数
  const defaultConfig = experiment?.recommendation_config || DEFAULT_RECOMMENDATION_CONFIG;
  const [coreRatio, setCoreRatio] = useState(defaultConfig.core_ratio);
  const [edgeRatio, setEdgeRatio] = useState(defaultConfig.edge_ratio);
  const [hotRatio, setHotRatio] = useState(defaultConfig.hot_ratio);
  const [exploreRatio, setExploreRatio] = useState(defaultConfig.explore_ratio);
  const [finalCount, setFinalCount] = useState(defaultConfig.final_count);
  const [minUniqueTags, setMinUniqueTags] = useState(defaultConfig.min_unique_tags);

  // 关键词生成 Prompt 状态（保持兼容）
  const [keywordColdStartPrompt, setKeywordColdStartPrompt] = useState(
    experiment?.customKeywordColdStartPrompt || DEFAULT_KEYWORD_COLD_START_TASK
  );
  const [keywordInteractionPrompt, setKeywordInteractionPrompt] = useState(
    experiment?.customKeywordInteractionPrompt || DEFAULT_KEYWORD_INTERACTION_TASK
  );

  const handleSave = async () => {
    const updates: Partial<Experiment> = {
      stage1_custom_prompt: stage1Prompt,
      stage2_custom_prompt: stage2Prompt,
      stage3_custom_prompt: stage3Prompt,
      stage4_custom_prompt: stage4Prompt,
      recommendation_config: {
        core_ratio: coreRatio,
        edge_ratio: edgeRatio,
        hot_ratio: hotRatio,
        explore_ratio: exploreRatio,
        final_count: finalCount,
        min_unique_tags: minUniqueTags
      },
      customKeywordColdStartPrompt: keywordColdStartPrompt,
      customKeywordInteractionPrompt: keywordInteractionPrompt
    };

    // 如果有实验，直接发送完整的合并对象到服务端
    if (experiment) {
      const fullExperiment = { ...experiment, ...updates };
      try {
        await fetch('/api/experiments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fullExperiment)
        });
        console.log('[ConfigModal] 配置已保存');
      } catch (e) {
        console.error('[ConfigModal] 保存失败:', e);
      }
    }

    onSave(updates);
    onClose();
  };

  const handleReset = (stage: 1 | 2 | 3 | 4) => {
    switch (stage) {
      case 1: setStage1Prompt(STAGE1_DEFAULT_USER_PROMPT); break;
      case 2: setStage2Prompt(STAGE2_DEFAULT_USER_PROMPT); break;
      case 3: setStage3Prompt(STAGE3_DEFAULT_USER_PROMPT); break;
      case 4: setStage4Prompt(STAGE4_DEFAULT_USER_PROMPT); break;
    }
  };

  const getStageInfo = (stage: 1 | 2 | 3 | 4) => {
    const stageInfos = {
      1: {
        title: '阶段 1: 用户画像深度分析',
        description: '分析用户兴趣层次（核心/边缘/潜在）、内容偏好、探索倾向，并判断是否需要搜索新内容',
        systemPrompt: STAGE1_SYSTEM_PROMPT,
        userPrompt: stage1Prompt,
        setUserPrompt: setStage1Prompt,
        color: 'blue'
      },
      2: {
        title: '阶段 2: 多通道召回',
        description: '通过核心兴趣、边缘兴趣、热门内容、探索发现四个通道分别召回内容',
        systemPrompt: STAGE2_SYSTEM_PROMPT,
        userPrompt: stage2Prompt,
        setUserPrompt: setStage2Prompt,
        color: 'green'
      },
      3: {
        title: '阶段 3: 质量过滤',
        description: '评估内容质量、用户匹配度、新鲜度，过滤低质量和不相关内容',
        systemPrompt: STAGE3_SYSTEM_PROMPT,
        userPrompt: stage3Prompt,
        setUserPrompt: setStage3Prompt,
        color: 'yellow'
      },
      4: {
        title: '阶段 4: 精排 + 多样性优化',
        description: '应用位置策略（core/edge/explore slots），使用 MMR 优化多样性',
        systemPrompt: STAGE4_SYSTEM_PROMPT,
        userPrompt: stage4Prompt,
        setUserPrompt: setStage4Prompt,
        color: 'purple'
      }
    };
    return stageInfos[stage];
  };

  const stageInfo = getStageInfo(activeStage);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-6xl w-full flex flex-col max-h-[95vh]">
        {/* Header */}
        <div className="p-5 border-b flex justify-between items-center bg-slate-50 rounded-t-xl shrink-0">
          <div>
            <h2 className="font-bold text-slate-800 text-lg">实验配置</h2>
            <p className="text-slate-500 text-xs">
              {experiment?.id ? `实验: ${experiment.name || experiment.id}` : '全局配置'}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl">×</button>
        </div>

        {/* Tabs */}
        <div className="border-b bg-slate-50 px-5 flex gap-1 shrink-0">
          <button
            onClick={() => setActiveTab('recommendation')}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'recommendation'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            四阶段推荐配置
          </button>
          <button
            onClick={() => setActiveTab('keyword')}
            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === 'keyword'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            关键词生成配置
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'recommendation' ? (
            <div className="flex h-full">
              {/* Left: Stage Selector */}
              <div className="w-64 border-r bg-slate-50 p-4 shrink-0">
                <h3 className="text-xs font-bold text-slate-500 uppercase mb-3">推荐阶段</h3>
                <div className="space-y-2">
                  {[1, 2, 3, 4].map((stage) => {
                    const info = getStageInfo(stage as 1 | 2 | 3 | 4);
                    return (
                      <button
                        key={stage}
                        onClick={() => setActiveStage(stage as 1 | 2 | 3 | 4)}
                        className={`w-full text-left p-3 rounded-lg transition-all ${
                          activeStage === stage
                            ? 'bg-white shadow-sm border border-indigo-200'
                            : 'hover:bg-white/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`w-6 h-6 rounded-full bg-${info.color}-100 text-${info.color}-600 flex items-center justify-center text-xs font-bold`}>
                            {stage}
                          </span>
                          <span className={`text-sm font-medium ${activeStage === stage ? 'text-slate-800' : 'text-slate-600'}`}>
                            阶段 {stage}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                          {info.description.slice(0, 30)}...
                        </p>
                      </button>
                    );
                  })}
                </div>

                {/* 参数配置 */}
                <div className="mt-6 pt-4 border-t">
                  <h3 className="text-xs font-bold text-slate-500 uppercase mb-3">召回比例配置</h3>
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="text-slate-600">核心兴趣 ({Math.round(coreRatio * 100)}%)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={coreRatio * 100}
                        onChange={(e) => setCoreRatio(Number(e.target.value) / 100)}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="text-slate-600">边缘兴趣 ({Math.round(edgeRatio * 100)}%)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={edgeRatio * 100}
                        onChange={(e) => setEdgeRatio(Number(e.target.value) / 100)}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="text-slate-600">热门内容 ({Math.round(hotRatio * 100)}%)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={hotRatio * 100}
                        onChange={(e) => setHotRatio(Number(e.target.value) / 100)}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="text-slate-600">探索发现 ({Math.round(exploreRatio * 100)}%)</label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={exploreRatio * 100}
                        onChange={(e) => setExploreRatio(Number(e.target.value) / 100)}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <label className="text-slate-600">最终推荐数</label>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={finalCount}
                        onChange={(e) => setFinalCount(Number(e.target.value))}
                        className="w-16 px-2 py-1 border rounded text-center"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="text-slate-600">最少不同标签</label>
                      <input
                        type="number"
                        min="1"
                        max="10"
                        value={minUniqueTags}
                        onChange={(e) => setMinUniqueTags(Number(e.target.value))}
                        className="w-16 px-2 py-1 border rounded text-center"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Prompt Editor */}
              <div className="flex-1 p-6 overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{stageInfo.title}</h3>
                    <p className="text-sm text-slate-500">{stageInfo.description}</p>
                  </div>
                  <button
                    onClick={() => handleReset(activeStage)}
                    className="text-xs text-slate-500 hover:text-indigo-600 px-3 py-1.5 border rounded-lg hover:border-indigo-300"
                  >
                    重置为默认
                  </button>
                </div>

                {/* System Prompt (Read-only) */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase">系统锁定部分 (不可修改)</span>
                    <span className="text-xs text-slate-400">定义 AI 角色和核心职责</span>
                  </div>
                  <div className="bg-slate-100 border border-slate-200 rounded-lg p-4 text-xs text-slate-600 font-mono leading-relaxed max-h-40 overflow-y-auto">
                    <pre className="whitespace-pre-wrap">{stageInfo.systemPrompt}</pre>
                  </div>
                </div>

                {/* User Prompt (Editable) */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-indigo-600 uppercase">用户可配置部分</span>
                    <span className="text-xs text-slate-400">详细的任务指令和评估标准</span>
                  </div>
                  <textarea
                    value={stageInfo.userPrompt}
                    onChange={(e) => stageInfo.setUserPrompt(e.target.value)}
                    className="w-full h-[400px] border border-slate-300 rounded-lg p-4 font-mono text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none leading-relaxed resize-y"
                    placeholder="编写任务指令..."
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Keyword Generation Tab */
            <div className="p-6">
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg text-sm text-blue-800 mb-6">
                <strong>说明：</strong> 关键词生成用于在推荐流程中搜索新内容丰富候选池。
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                {/* Cold Start */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                    <h3 className="text-sm font-bold text-slate-700">冷启动关键词生成</h3>
                  </div>
                  <div className="bg-slate-100 border border-slate-300 rounded-t-lg p-3 text-[10px] text-slate-500 font-mono leading-tight max-h-32 overflow-y-auto">
                    <pre className="whitespace-pre-wrap">{FIXED_KEYWORD_COLD_START_PREAMBLE}</pre>
                  </div>
                  <textarea
                    value={keywordColdStartPrompt}
                    onChange={e => setKeywordColdStartPrompt(e.target.value)}
                    className="w-full min-h-[200px] border border-slate-300 border-t-0 rounded-b-lg p-3 font-mono text-xs focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
                  />
                </div>

                {/* Interaction */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                    <h3 className="text-sm font-bold text-slate-700">交互后关键词生成</h3>
                  </div>
                  <div className="bg-slate-100 border border-slate-300 rounded-t-lg p-3 text-[10px] text-slate-500 font-mono leading-tight max-h-32 overflow-y-auto">
                    <pre className="whitespace-pre-wrap">{FIXED_KEYWORD_INTERACTION_PREAMBLE}</pre>
                  </div>
                  <textarea
                    value={keywordInteractionPrompt}
                    onChange={e => setKeywordInteractionPrompt(e.target.value)}
                    className="w-full min-h-[200px] border border-slate-300 border-t-0 rounded-b-lg p-3 font-mono text-xs focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t bg-slate-50 rounded-b-xl flex justify-end gap-3 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium">取消</button>
          <button onClick={handleSave} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-bold hover:bg-indigo-700 shadow-sm">
            保存配置
          </button>
        </div>
      </div>
    </div>
  );
};
