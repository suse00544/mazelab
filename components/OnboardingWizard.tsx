import React, { useState, useEffect } from 'react';
import { OnboardingQuestion, UserProfile } from '../types';

interface Props {
  userId: string;
  onComplete: (profile: UserProfile) => void;
  onSkip?: () => void;
}

const defaultQuestions: OnboardingQuestion[] = [
  {
    id: 'gender',
    question: '您的性别是？',
    type: 'single',
    options: ['男', '女', '其他', '不想透露'],
    required: true,
    order: 1,
    category: 'basic'
  },
  {
    id: 'age_range',
    question: '您的年龄段是？',
    type: 'single',
    options: ['18岁以下', '18-24岁', '25-34岁', '35-44岁', '45岁以上'],
    required: true,
    order: 2,
    category: 'basic'
  },
  {
    id: 'content_types',
    question: '您喜欢看哪类内容？（可多选）',
    type: 'multiple',
    options: ['美食', '旅行', '时尚穿搭', '美妆护肤', '科技数码', '健身运动', '家居装修', '宠物', '摄影', '读书学习', '职场成长', '情感生活'],
    required: true,
    order: 3,
    category: 'interest'
  },
  {
    id: 'content_style',
    question: '您更喜欢什么风格的内容？',
    type: 'single',
    options: ['干货教程型', '轻松娱乐型', '深度分析型', '真实分享型', '精美视觉型'],
    required: true,
    order: 4,
    category: 'interest'
  },
  {
    id: 'recent_interests',
    question: '最近您对什么话题比较感兴趣？',
    type: 'text',
    required: false,
    order: 5,
    category: 'interest'
  },
  {
    id: 'discovery_preference',
    question: '您希望内容推荐偏向于？',
    type: 'single',
    options: ['更多我喜欢的类型', '适当探索新领域', '大胆尝试新鲜事物'],
    required: true,
    order: 6,
    category: 'behavior'
  }
];

export const OnboardingWizard: React.FC<Props> = ({ userId, onComplete, onSkip }) => {
  const [questions, setQuestions] = useState<OnboardingQuestion[]>(defaultQuestions);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      const res = await fetch('/api/onboarding/questions');
      const data = await res.json();
      if (data && data.length > 0) {
        setQuestions(data);
      }
    } catch (e) {
      console.log('Using default questions');
    }
  };

  const currentQuestion = questions[currentIndex];
  const progress = ((currentIndex + 1) / questions.length) * 100;
  const isLast = currentIndex === questions.length - 1;
  const canProceed = !currentQuestion?.required || answers[currentQuestion.id];

  const handleSingleSelect = (option: string) => {
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: option }));
  };

  const handleMultiSelect = (option: string) => {
    const current = answers[currentQuestion.id] || [];
    const updated = current.includes(option)
      ? current.filter((o: string) => o !== option)
      : [...current, option];
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: updated }));
  };

  const handleTextInput = (text: string) => {
    setAnswers(prev => ({ ...prev, [currentQuestion.id]: text }));
  };

  const handleNext = () => {
    if (isLast) {
      handleSubmit();
    } else {
      setCurrentIndex(prev => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const profile: UserProfile = {
        userId,
        answers,
        demographics: {
          gender: answers.gender,
          age_range: answers.age_range
        },
        interests: answers.content_types || [],
        recent_topics: answers.recent_interests ? [answers.recent_interests] : [],
        created_at: Date.now(),
        updated_at: Date.now()
      };

      await fetch('/api/user-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });

      onComplete(profile);
    } catch (e) {
      console.error('Failed to save profile:', e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-pink-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden">
          <div className="h-2 bg-gray-100">
            <div 
              className="h-full bg-gradient-to-r from-indigo-500 to-pink-500 transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="p-6 md:p-8">
            <div className="text-center mb-2">
              <span className="text-sm text-gray-400">
                {currentIndex + 1} / {questions.length}
              </span>
            </div>

            <h2 className="text-xl md:text-2xl font-bold text-gray-800 text-center mb-8 leading-relaxed">
              {currentQuestion?.question}
            </h2>

            <div className="space-y-3 mb-8">
              {currentQuestion?.type === 'single' && currentQuestion.options?.map((option) => (
                <button
                  key={option}
                  onClick={() => handleSingleSelect(option)}
                  className={`w-full p-4 rounded-2xl border-2 text-left transition-all duration-200 ${
                    answers[currentQuestion.id] === option
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center">
                    <div className={`w-5 h-5 rounded-full border-2 mr-3 flex items-center justify-center ${
                      answers[currentQuestion.id] === option
                        ? 'border-indigo-500 bg-indigo-500'
                        : 'border-gray-300'
                    }`}>
                      {answers[currentQuestion.id] === option && (
                        <div className="w-2 h-2 rounded-full bg-white" />
                      )}
                    </div>
                    {option}
                  </div>
                </button>
              ))}

              {currentQuestion?.type === 'multiple' && currentQuestion.options?.map((option) => {
                const selected = (answers[currentQuestion.id] || []).includes(option);
                return (
                  <button
                    key={option}
                    onClick={() => handleMultiSelect(option)}
                    className={`w-full p-4 rounded-2xl border-2 text-left transition-all duration-200 ${
                      selected
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-700 font-medium'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center">
                      <div className={`w-5 h-5 rounded-md border-2 mr-3 flex items-center justify-center ${
                        selected ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'
                      }`}>
                        {selected && (
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      {option}
                    </div>
                  </button>
                );
              })}

              {currentQuestion?.type === 'text' && (
                <textarea
                  value={answers[currentQuestion.id] || ''}
                  onChange={(e) => handleTextInput(e.target.value)}
                  placeholder="请输入您的回答..."
                  className="w-full p-4 rounded-2xl border-2 border-gray-200 focus:border-indigo-500 focus:ring-0 outline-none transition-colors resize-none h-32"
                />
              )}
            </div>

            <div className="flex gap-3">
              {currentIndex > 0 && (
                <button
                  onClick={handleBack}
                  className="flex-1 py-4 rounded-2xl border-2 border-gray-200 text-gray-600 font-medium hover:bg-gray-50 transition-colors"
                >
                  上一步
                </button>
              )}
              <button
                onClick={handleNext}
                disabled={!canProceed || isLoading}
                className={`flex-1 py-4 rounded-2xl font-medium transition-all duration-200 ${
                  canProceed && !isLoading
                    ? 'bg-gradient-to-r from-indigo-500 to-pink-500 text-white hover:shadow-lg hover:scale-[1.02]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    保存中...
                  </span>
                ) : isLast ? '开始体验' : '下一步'}
              </button>
            </div>

            {onSkip && (
              <button
                onClick={onSkip}
                className="w-full mt-4 py-2 text-gray-400 text-sm hover:text-gray-600 transition-colors"
              >
                跳过问卷
              </button>
            )}
          </div>
        </div>

        <p className="text-center text-gray-400 text-sm mt-6">
          您的回答将帮助我们提供更个性化的内容推荐
        </p>
      </div>
    </div>
  );
};
