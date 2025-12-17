import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Article, Interaction } from '../types';

interface Highlight {
  text: string;
  comment: string;
  startOffset?: number;
  endOffset?: number;
}

interface Props {
  article: Article;
  userId: string;
  sessionId: string;
  experimentId: string;
  onClose: (interactionData: Omit<Interaction, 'id' | 'timestamp'>) => void;
}

export const ArticleView: React.FC<Props> = ({ article, userId, sessionId, experimentId, onClose }) => {
  const [liked, setLiked] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [comment, setComment] = useState('');
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // 图片列表
  const imageUrls = article.images && article.images.length > 0
    ? article.images
    : article.cover
      ? [article.cover]
      : [];

  // 画线评论相关状态
  const [selectionPopup, setSelectionPopup] = useState<{
    visible: boolean;
    x: number;
    y: number;
    text: string;
  }>({ visible: false, x: 0, y: 0, text: '' });
  const [highlightComment, setHighlightComment] = useState('');
  const [showHighlightInput, setShowHighlightInput] = useState(false);

  const contentRef = useRef<HTMLDivElement>(null);
  const articleContentRef = useRef<HTMLDivElement>(null);

  // Tracking Refs
  const startTimeRef = useRef<number>(Date.now());
  const maxScrollRef = useRef<number>(0);

  // Scroll tracking logic
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const calculateProgress = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const scrollableHeight = scrollHeight - clientHeight;
      if (scrollableHeight <= 0) return 1.0;
      if (scrollTop === 0 && maxScrollRef.current === 0) {
        return Math.min(clientHeight / scrollHeight, 1.0);
      }
      return Math.min(scrollTop / scrollableHeight, 1.0);
    };

    const initializeScrollDepth = () => {
      const initialProgress = calculateProgress();
      if (initialProgress > maxScrollRef.current) {
        maxScrollRef.current = initialProgress;
      }
    };

    initializeScrollDepth();
    const timer = setTimeout(initializeScrollDepth, 100);

    const handleScroll = () => {
      const currentProgress = calculateProgress();
      if (currentProgress > maxScrollRef.current) {
        maxScrollRef.current = currentProgress;
      }
    };

    el.addEventListener('scroll', handleScroll);
    return () => {
      el.removeEventListener('scroll', handleScroll);
      clearTimeout(timer);
    };
  }, [article.id]);

  // 处理文本选择
  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.toString().trim()) {
      setSelectionPopup(prev => ({ ...prev, visible: false }));
      return;
    }

    const selectedText = selection.toString().trim();
    if (selectedText.length < 2) return;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const container = contentRef.current;

    if (container) {
      const containerRect = container.getBoundingClientRect();
      // 计算相对于容器的位置，需要加上容器的滚动偏移
      const scrollTop = container.scrollTop;
      setSelectionPopup({
        visible: true,
        x: rect.left + rect.width / 2 - containerRect.left,
        y: rect.top - containerRect.top + scrollTop - 10,
        text: selectedText
      });
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection);
    return () => document.removeEventListener('mouseup', handleTextSelection);
  }, [handleTextSelection]);

  const handleAddHighlight = () => {
    setShowHighlightInput(true);
    setHighlightComment('');
  };

  const handleSaveHighlight = () => {
    if (!selectionPopup.text) return;

    const newHighlight: Highlight = {
      text: selectionPopup.text,
      comment: highlightComment.trim()
    };

    setHighlights(prev => [...prev, newHighlight]);
    setSelectionPopup({ visible: false, x: 0, y: 0, text: '' });
    setShowHighlightInput(false);
    setHighlightComment('');
    window.getSelection()?.removeAllRanges();
  };

  const handleRemoveHighlight = (index: number) => {
    setHighlights(prev => prev.filter((_, i) => i !== index));
  };

  const handleFinish = () => {
    const dwellTime = (Date.now() - startTimeRef.current) / 1000;

    const interactionPayload: Omit<Interaction, 'id' | 'timestamp'> = {
      userId,
      articleId: article.id,
      sessionId,
      experimentId,
      clicked: true,
      dwellTime,
      scrollDepth: maxScrollRef.current,
      liked,
      favorited,
      comment: comment.trim() || undefined,
      highlights: highlights.length > 0 ? highlights : undefined,
      articleContext: {
        title: article.title,
        tags: article.tag_list || [],
        summary: article.desc,
      }
    };

    onClose(interactionPayload);
  };

  const tags = article.tag_list || [];

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Header */}
      <div className="h-14 border-b flex items-center justify-between px-4 bg-white shrink-0">
        <button
          onClick={handleFinish}
          className="text-slate-600 hover:text-slate-900 font-medium flex items-center gap-1"
        >
          <span className="text-lg">←</span>
          <span className="text-sm">返回</span>
        </button>
        <div className="flex items-center gap-2">
          {/* 快捷互动按钮 */}
          <button
            onClick={() => setLiked(!liked)}
            className={`p-2 rounded-full transition-all ${liked ? 'bg-pink-100 text-pink-600' : 'text-slate-400 hover:bg-slate-100'}`}
          >
            {liked ? '♥' : '♡'}
          </button>
          <button
            onClick={() => setFavorited(!favorited)}
            className={`p-2 rounded-full transition-all ${favorited ? 'bg-amber-100 text-amber-600' : 'text-slate-400 hover:bg-slate-100'}`}
          >
            {favorited ? '★' : '☆'}
          </button>
        </div>
      </div>

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto w-full relative">
        <div className="max-w-2xl mx-auto p-4 pt-6">
          {/* 标题 */}
          <h1 className="text-2xl font-bold text-slate-900 mb-4 leading-tight">{article.title}</h1>

          {/* 作者信息 + 互动数据 */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
            {/* 左侧：作者信息 */}
            <div className="flex items-center gap-3">
              {article.user_avatar || article.user?.avatar ? (
                <img
                  src={article.user_avatar || article.user?.avatar}
                  alt={article.user_nickname || article.user?.nickname || '作者'}
                  className="w-10 h-10 rounded-full object-cover bg-slate-200"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-white font-medium">
                  {(article.user_nickname || article.user?.nickname || '匿')?.charAt(0)}
                </div>
              )}
              <div>
                <div className="font-medium text-slate-900 text-sm">
                  {article.user_nickname || article.user?.nickname || '匿名用户'}
                </div>
                <div className="text-xs text-slate-400">
                  {article.time
                    ? new Date(article.time * 1000).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
                    : article.created_at
                      ? new Date(article.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
                      : ''}
                </div>
              </div>
            </div>

            {/* 右侧：互动数据 */}
            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span className="flex items-center gap-1">
                <span className="text-pink-500">♥</span>
                {article.liked_count || 0}
              </span>
              <span className="flex items-center gap-1">
                <span className="text-amber-500">★</span>
                {article.collected_count || 0}
              </span>
              <span className="flex items-center gap-1">
                <span>💬</span>
                {article.comment_count || 0}
              </span>
            </div>
          </div>

          {/* 图片展示 */}
          {imageUrls.length > 0 && (
            <div className={`grid gap-2 mb-6 ${imageUrls.length === 1 ? 'grid-cols-1' : imageUrls.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {imageUrls.slice(0, 9).map((url, idx) => (
                <div
                  key={idx}
                  className="relative overflow-hidden bg-slate-100 rounded-lg cursor-pointer"
                  style={{ aspectRatio: imageUrls.length === 1 ? '16/9' : '1/1' }}
                  onClick={() => setLightboxIndex(idx)}
                >
                  <img
                    src={url}
                    alt={`${article.title} - ${idx + 1}`}
                    className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                  />
                  {imageUrls.length > 1 && (
                    <div className="absolute bottom-1 right-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded">
                      {idx + 1}/{Math.min(imageUrls.length, 9)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 文章正文 */}
          <div
            ref={articleContentRef}
            className="text-slate-700 leading-relaxed whitespace-pre-wrap text-base mb-6"
          >
            {article.desc}
          </div>

          {/* 标签区域 - 移到文章下面 */}
          {tags.length > 0 && (
            <div className="flex gap-2 flex-wrap py-4 border-t border-slate-100">
              {tags.map((t: string) => (
                <span key={t} className="bg-slate-100 text-slate-500 px-3 py-1 rounded-full text-xs">
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* 画线评论列表 */}
          {highlights.length > 0 && (
            <div className="mt-4 mb-6 p-4 bg-amber-50 rounded-xl border border-amber-100">
              <h4 className="text-sm font-semibold text-amber-800 mb-3 flex items-center gap-2">
                <span>✍️</span>
                我的标注 ({highlights.length})
              </h4>
              <div className="space-y-3">
                {highlights.map((h, idx) => (
                  <div key={idx} className="bg-white rounded-lg p-3 border border-amber-100 relative group">
                    <button
                      onClick={() => handleRemoveHighlight(idx)}
                      className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ×
                    </button>
                    <div className="text-sm text-amber-700 border-l-2 border-amber-400 pl-3 mb-2 italic">
                      "{h.text.length > 50 ? h.text.slice(0, 50) + '...' : h.text}"
                    </div>
                    {h.comment && (
                      <div className="text-sm text-slate-600 pl-3">
                        💬 {h.comment}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 互动区域 */}
          <div className="mb-20 space-y-4">
            {/* 主互动按钮 */}
            <div className="flex gap-3">
              <button
                onClick={() => setLiked(!liked)}
                className={`flex-1 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
                  liked
                    ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-lg shadow-pink-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span className="text-lg">{liked ? '♥' : '♡'}</span>
                {liked ? '已喜欢' : '喜欢'}
              </button>
              <button
                onClick={() => setFavorited(!favorited)}
                className={`flex-1 py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 ${
                  favorited
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-200'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span className="text-lg">{favorited ? '★' : '☆'}</span>
                {favorited ? '已收藏' : '收藏'}
              </button>
            </div>

            {/* 评论输入 */}
            <div className="bg-slate-50 rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-2">
                写下你的想法，这将直接影响 AI 的推荐策略
              </div>
              <textarea
                className="w-full border-0 bg-white rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 placeholder-slate-400 resize-none"
                rows={2}
                placeholder="说点什么..."
                value={comment}
                onChange={e => setComment(e.target.value)}
              />
            </div>

            {/* 提示 */}
            <div className="text-center text-xs text-slate-400 py-2">
              💡 选中文章中的文字可以添加标注
            </div>
          </div>

          <div className="h-8 flex items-center justify-center text-slate-200 text-xs">
            {article.id}
          </div>
        </div>

        {/* 文本选择弹出框 */}
        {selectionPopup.visible && (
          <div
            className="absolute z-50 transform -translate-x-1/2 -translate-y-full"
            style={{ left: selectionPopup.x, top: selectionPopup.y }}
          >
            {!showHighlightInput ? (
              <div className="bg-slate-900 text-white rounded-lg shadow-xl px-3 py-2 flex items-center gap-2 animate-in fade-in zoom-in duration-150">
                <button
                  onClick={handleAddHighlight}
                  className="flex items-center gap-1 text-sm hover:text-amber-400 transition-colors"
                >
                  <span>✍️</span>
                  <span>标注</span>
                </button>
                <div className="w-px h-4 bg-slate-600" />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectionPopup.text);
                    setSelectionPopup({ visible: false, x: 0, y: 0, text: '' });
                  }}
                  className="flex items-center gap-1 text-sm hover:text-blue-400 transition-colors"
                >
                  <span>📋</span>
                  <span>复制</span>
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-2xl p-3 w-72 border border-slate-200 animate-in fade-in zoom-in duration-150">
                <div className="text-xs text-slate-400 mb-2 truncate">
                  标注: "{selectionPopup.text.slice(0, 30)}..."
                </div>
                <textarea
                  autoFocus
                  className="w-full border border-slate-200 rounded-lg p-2 text-sm focus:ring-2 focus:ring-amber-500 outline-none resize-none"
                  rows={2}
                  placeholder="添加你的想法（可选）"
                  value={highlightComment}
                  onChange={e => setHighlightComment(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSaveHighlight();
                    }
                  }}
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    onClick={() => {
                      setShowHighlightInput(false);
                      setSelectionPopup({ visible: false, x: 0, y: 0, text: '' });
                    }}
                    className="px-3 py-1 text-sm text-slate-500 hover:text-slate-700"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleSaveHighlight}
                    className="px-3 py-1 text-sm bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                  >
                    保存
                  </button>
                </div>
              </div>
            )}
            {/* 小箭头 */}
            <div className="absolute left-1/2 -translate-x-1/2 top-full">
              <div className={`w-0 h-0 border-l-[6px] border-r-[6px] border-t-[6px] border-transparent ${showHighlightInput ? 'border-t-white' : 'border-t-slate-900'}`} />
            </div>
          </div>
        )}
      </div>

      {/* 图片查看器 */}
      {lightboxIndex !== null && imageUrls.length > 0 && (
        <div
          className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4"
          onClick={() => setLightboxIndex(null)}
        >
          <div
            className="relative bg-slate-900 rounded-2xl overflow-hidden shadow-2xl max-w-3xl max-h-[80vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 顶部工具栏 */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-800/50">
              <span className="text-white/80 text-sm font-medium">
                {lightboxIndex + 1} / {imageUrls.length}
              </span>
              <button
                className="text-white/80 hover:text-white text-xl w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
                onClick={() => setLightboxIndex(null)}
              >
                ×
              </button>
            </div>

            {/* 图片区域 */}
            <div className="relative flex-1 flex items-center justify-center min-h-[300px] max-h-[60vh] bg-black">
              <img
                src={imageUrls[lightboxIndex]}
                alt={`图片 ${lightboxIndex + 1}`}
                className="max-w-full max-h-full object-contain"
              />

              {/* 左切换按钮 */}
              {imageUrls.length > 1 && (
                <button
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxIndex(prev => prev !== null ? (prev - 1 + imageUrls.length) % imageUrls.length : 0);
                  }}
                >
                  ‹
                </button>
              )}

              {/* 右切换按钮 */}
              {imageUrls.length > 1 && (
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-black/40 hover:bg-black/60 text-white rounded-full flex items-center justify-center transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxIndex(prev => prev !== null ? (prev + 1) % imageUrls.length : 0);
                  }}
                >
                  ›
                </button>
              )}
            </div>

            {/* 底部缩略图导航 */}
            {imageUrls.length > 1 && (
              <div className="flex gap-2 p-3 bg-slate-800/50 overflow-x-auto justify-center">
                {imageUrls.map((url, idx) => (
                  <button
                    key={idx}
                    className={`w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-all ${
                      idx === lightboxIndex ? 'border-white scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                    onClick={() => setLightboxIndex(idx)}
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
