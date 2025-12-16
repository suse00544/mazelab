import React, { useState } from 'react';
import { Article, ContentMedia } from '../types';

interface Props {
  article: Article;
  onClose?: () => void;
}

const MediaCarousel: React.FC<{ media: ContentMedia[] }> = ({ media }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  if (!media || !Array.isArray(media) || media.length === 0) return null;

  const handlePrev = () => {
    setCurrentIndex(prev => (prev > 0 ? prev - 1 : media.length - 1));
  };

  const handleNext = () => {
    setCurrentIndex(prev => (prev < media.length - 1 ? prev + 1 : 0));
  };

  const handleDotClick = (index: number) => {
    setCurrentIndex(index);
  };

  return (
    <div className="relative bg-black">
      <div className="aspect-[4/5] relative overflow-hidden">
        {media.map((item, index) => (
          <div
            key={index}
            className={`absolute inset-0 transition-opacity duration-300 ${
              index === currentIndex ? 'opacity-100' : 'opacity-0'
            }`}
          >
            {item.type === 'image' ? (
              <img
                src={item.url_local}
                alt={`图片 ${index + 1}`}
                className="w-full h-full object-contain"
                loading="lazy"
              />
            ) : (
              <video
                src={item.url_local}
                className="w-full h-full object-contain"
                controls
              />
            )}
          </div>
        ))}
      </div>

      {media.length > 1 && (
        <>
          <button
            onClick={handlePrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 text-white flex items-center justify-center hover:bg-black/50 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={handleNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/30 text-white flex items-center justify-center hover:bg-black/50 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
            {media.map((_, index) => (
              <button
                key={index}
                onClick={() => handleDotClick(index)}
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentIndex
                    ? 'bg-white w-4'
                    : 'bg-white/50 hover:bg-white/70'
                }`}
              />
            ))}
          </div>

          <div className="absolute top-4 right-4 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
            {currentIndex + 1} / {media.length}
          </div>
        </>
      )}
    </div>
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

  const renderContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, i) => {
      if (line.startsWith('![')) {
        return null;
      }
      if (line.startsWith('# ')) {
        return <h1 key={i} className="text-xl font-bold mb-3">{line.slice(2)}</h1>;
      }
      if (line.startsWith('## ')) {
        return <h2 key={i} className="text-lg font-bold mb-2">{line.slice(3)}</h2>;
      }
      if (line.trim() === '') {
        return <div key={i} className="h-3" />;
      }
      return <p key={i} className="text-gray-700 leading-relaxed mb-2">{line}</p>;
    });
  };

  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-lg max-w-lg mx-auto">
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 left-4 z-10 w-8 h-8 rounded-full bg-black/30 text-white flex items-center justify-center hover:bg-black/50"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      <MediaCarousel media={media} />

      <div className="p-4">
        {article.author && (
          <div className="flex items-center gap-3 mb-4">
            {article.author.avatar ? (
              <img
                src={article.author.avatar.startsWith('/') ? article.author.avatar : `/api/image-proxy?url=${encodeURIComponent(article.author.avatar)}`}
                alt={article.author.name}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center text-white font-bold">
                {article.author.name?.charAt(0) || '?'}
              </div>
            )}
            <div>
              <div className="font-medium text-gray-900">{article.author.name}</div>
              {article.publish_time && (
                <div className="text-xs text-gray-400">
                  {new Date(article.publish_time).toLocaleDateString('zh-CN')}
                </div>
              )}
            </div>
          </div>
        )}

        <h1 className="text-lg font-bold text-gray-900 mb-3 leading-snug">
          {article.title}
        </h1>

        <div className="text-gray-700 text-sm leading-relaxed mb-4">
          {renderContent(article.content)}
        </div>

        {article.tags && article.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {article.tags.slice(0, 8).map((tag, i) => (
              <span
                key={i}
                className="text-xs text-blue-500 bg-blue-50 px-2 py-1 rounded-full"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {article.metrics && (
          <div className="flex items-center gap-6 pt-4 border-t border-gray-100 text-gray-500">
            <div className="flex items-center gap-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
              <span className="text-sm">{formatNumber(article.metrics.likes)}</span>
            </div>
            <div className="flex items-center gap-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              <span className="text-sm">{formatNumber(article.metrics.favorites)}</span>
            </div>
            <div className="flex items-center gap-1">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <span className="text-sm">{formatNumber(article.metrics.comments)}</span>
            </div>
          </div>
        )}

        {article.source && (
          <div className="mt-4 pt-4 border-t border-gray-100">
            <span className="text-xs text-gray-400">
              来源: {article.source === 'xhs' ? '小红书' : article.source === 'jina' ? '网页导入' : '手动创建'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
