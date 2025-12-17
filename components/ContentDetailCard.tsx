import React, { useState } from 'react';
import { Article, ContentMedia } from '../types';

interface Props {
  article: Article;
  onClose?: () => void;
}

const MediaGrid: React.FC<{ media: ContentMedia[] }> = ({ media }) => {
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  if (!media || !Array.isArray(media) || media.length === 0) return null;

  // 固定 4 列网格布局（与小红书详情页一致）
  const getGridClass = () => 'grid-cols-4';

  return (
    <>
      <div className={`grid ${getGridClass()} gap-2 mb-4`}>
        {media.map((item, index) => (
          <div
            key={index}
            className="relative overflow-hidden bg-gray-100 rounded-lg"
            style={{ aspectRatio: '1/1' }}
          >
            {item.type === 'image' ? (
              <img
                src={item.url_local}
                alt={`图片 ${index + 1}`}
                className="w-full h-full object-cover hover:opacity-90 transition-opacity cursor-pointer"
                loading="lazy"
                onClick={() => setLightboxImage(item.url_local)}
              />
            ) : (
              <video
                src={item.url_local}
                className="w-full h-full object-cover"
                controls
              />
            )}
          </div>
        ))}
      </div>

      {/* 图片放大预览弹窗 */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxImage(null)}
        >
          <button
            className="absolute top-4 right-4 text-white text-3xl font-bold hover:text-gray-300"
            onClick={() => setLightboxImage(null)}
          >
            ×
          </button>
          <img
            src={lightboxImage}
            alt="预览"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
};

const formatNumber = (num: number): string => {
  if (num >= 10000) return (num / 10000).toFixed(1) + '万';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
};

export const ContentDetailCard: React.FC<Props> = ({ article, onClose }) => {
  const media: ContentMedia[] = [];

  if (Array.isArray(article.media) && article.media.length > 0) {
    media.push(...article.media);
  } else if (article.imageUrl) {
    media.push({
      type: 'image',
      url_local: article.imageUrl,
      order: 0
    });
  }


  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-lg max-w-lg mx-auto h-full flex flex-col">
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full bg-white/90 text-gray-700 flex items-center justify-center hover:bg-white shadow-md"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      <div className="p-4 flex-1 overflow-y-auto">
        {/* 1. 标题 */}
        <h1 className="text-lg font-bold text-gray-900 mb-3 leading-tight">
          {article.title}
        </h1>

        {/* 2. 作者信息 */}
        {article.author && (
          <div className="flex items-center gap-2 mb-3 text-sm">
            {article.author.avatar ? (
              <img
                src={article.author.avatar.startsWith('/') ? article.author.avatar : `/api/image-proxy?url=${encodeURIComponent(article.author.avatar)}`}
                alt={article.author.name}
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                {article.author.name?.charAt(0) || '?'}
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-gray-900 font-medium">{article.author.name}</span>
              {article.publish_time && (
                <span className="text-gray-400 text-xs">
                  {new Date(article.publish_time).toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' })}
                </span>
              )}
            </div>
          </div>
        )}

        {/* 3. 互动数据 */}
        {article.metrics && (
          <div className="flex items-center gap-4 text-gray-500 text-sm mb-4 pb-4 border-b border-gray-100">
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <span>{formatNumber(article.metrics.likes)}</span>
            </div>
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              <span>{formatNumber(article.metrics.favorites)}</span>
            </div>
            <div className="flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span>{formatNumber(article.metrics.comments)}</span>
            </div>
            {article.source && (
              <span className="text-xs text-gray-400 ml-auto">
                {article.source === 'xhs' ? '小红书' : article.source === 'jina' ? '网页导入' : '手动创建'}
              </span>
            )}
          </div>
        )}

        {/* 4. 图片平铺 */}
        <MediaGrid media={media} />

        {/* 5. 内容详情 */}
        {article.desc && (
          <div className="text-gray-700 text-sm leading-relaxed mb-4 whitespace-pre-wrap">
            {article.desc}
          </div>
        )}

        {/* 6. 话题标签 */}
        {article.tags && article.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {article.tags.slice(0, 8).map((tag, i) => (
              <span
                key={i}
                className="text-xs text-red-500 bg-red-50 px-2 py-1 rounded-full"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
