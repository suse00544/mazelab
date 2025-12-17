
import React from 'react';
import { Article } from '../types';

interface Props {
  article: Article;
  onClick: () => void;
}

// 格式化点赞数
const formatCount = (count: string | number | undefined): string => {
  if (!count) return '0';
  const num = typeof count === 'string' ? parseInt(count) : count;
  if (isNaN(num)) return '0';
  if (num >= 10000) return (num / 10000).toFixed(1) + '万';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
};

export const ArticleCard: React.FC<Props> = ({ article, onClick }) => {
  // 获取作者信息
  const authorName = article.user_nickname || article.author?.name || '未知用户';
  const authorAvatar = article.user_avatar || article.author?.avatar;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-xl overflow-hidden cursor-pointer hover:shadow-lg transition-shadow mb-3"
    >
      {/* 封面图：自适应高度，完美展示 */}
      {article.cover && (
        <div className="w-full bg-slate-100">
          <img
            src={article.cover}
            alt={article.title}
            className="w-full h-auto object-cover"
          />
        </div>
      )}

      {/* 内容区域 */}
      <div className="p-3">
        {/* 标题 */}
        <h3 className="text-sm font-medium text-slate-900 line-clamp-2 mb-2 leading-snug">
          {article.title}
        </h3>

        {/* 作者 + 点赞 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {authorAvatar ? (
              <img
                src={authorAvatar}
                alt={authorName}
                className="w-5 h-5 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-xs flex-shrink-0">
                {authorName.charAt(0)}
              </div>
            )}
            <span className="text-xs text-slate-500 truncate">{authorName}</span>
          </div>
          <div className="flex items-center gap-0.5 text-slate-400 flex-shrink-0">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            <span className="text-xs">{formatCount(article.liked_count)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
