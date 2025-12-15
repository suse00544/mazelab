
import React, { useEffect, useState, useRef } from 'react';
import { MarkdownRenderer } from './MarkdownRenderer';
import { Article, Interaction } from '../types';

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
  const [commentSaved, setCommentSaved] = useState(false);
  
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Tracking Refs
  const startTimeRef = useRef<number>(Date.now());
  const maxScrollRef = useRef<number>(0);

  // Scroll tracking logic
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    // Helper to calculate progress
    const calculateProgress = () => {
        const { scrollTop, scrollHeight, clientHeight } = el;
        const scrollableHeight = scrollHeight - clientHeight;
        
        // If content is shorter than screen, it's 100% read immediately
        if (scrollableHeight <= 0) {
            return 1.0;
        }
        
        // If just opened, calculate initial percentage visible
        if (scrollTop === 0 && maxScrollRef.current === 0) {
            return Math.min(clientHeight / scrollHeight, 1.0);
        }

        return Math.min(scrollTop / scrollableHeight, 1.0);
    };

    // Initialize immediate visibility
    maxScrollRef.current = calculateProgress();

    const handleScroll = () => {
      const currentProgress = calculateProgress();
      if (currentProgress > maxScrollRef.current) {
        maxScrollRef.current = currentProgress;
      }
    };

    el.addEventListener('scroll', handleScroll);
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

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
      articleContext: {
        title: article.title,
        category: article.category,
        tags: article.tags,
      }
    };
    
    onClose(interactionPayload);
  };

  const handleSaveComment = () => {
    if (!comment.trim()) return;
    setCommentSaved(true);
    setTimeout(() => {
        // Optional: Could auto-close or just let user continue reading
    }, 500);
  };

  return (
    <div className="fixed inset-0 bg-white z-50 flex flex-col">
      {/* Header */}
      <div className="h-16 border-b flex items-center justify-between px-4 bg-white shrink-0">
        <button 
          onClick={handleFinish}
          className="text-slate-600 hover:text-slate-900 font-medium flex items-center"
        >
          ← 返回列表
        </button>
        <div className="flex gap-3">
        </div>
      </div>

      {/* Content */}
      <div 
        ref={contentRef} 
        className="flex-1 overflow-y-auto w-full"
      >
        <div className="max-w-2xl mx-auto p-4 pt-6">
            <div className="mb-6">
               <span className="text-blue-600 font-medium text-sm">{article.category}</span>
               <h1 className="text-3xl font-bold text-slate-900 mt-1 mb-4">{article.title}</h1>
               <div className="flex gap-2 mb-6">
                  {article.tags?.map(t => <span key={t} className="bg-slate-100 text-slate-600 px-2 py-1 rounded text-xs">#{t}</span>)}
               </div>
               {article.imageUrl && (
                   <div className="w-full h-64 md:h-80 rounded-xl overflow-hidden mb-8">
                       <img src={article.imageUrl} alt={article.title} className="w-full h-full object-cover" />
                   </div>
               )}
            </div>
    
            {/* CONTENT RENDERING */}
            <div className="border-b border-slate-100 pb-8 mb-8">
              <MarkdownRenderer content={article.content || ''} />
            </div>
    
            {/* Interaction & Comment Section (Grouped) */}
            <div className="mb-20 bg-slate-50 p-6 rounded-xl border border-slate-200">
                <h3 className="text-lg font-bold text-slate-800 mb-4">你的反馈</h3>
                
                {/* Action Buttons */}
                <div className="flex gap-4 mb-6">
                    <button 
                        onClick={() => setLiked(!liked)}
                        className={`flex-1 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                            liked 
                            ? 'bg-pink-100 text-pink-600 border border-pink-200 shadow-sm' 
                            : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        <span className="text-xl">{liked ? '♥' : '♡'}</span>
                        {liked ? '已点赞' : '点赞'}
                    </button>
                    <button 
                        onClick={() => setFavorited(!favorited)}
                        className={`flex-1 py-3 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                            favorited 
                            ? 'bg-yellow-100 text-yellow-700 border border-yellow-200 shadow-sm' 
                            : 'bg-white border border-slate-300 text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        <span className="text-xl">{favorited ? '★' : '☆'}</span>
                        {favorited ? '已收藏' : '收藏'}
                    </button>
                </div>
    
                {/* Comment Input */}
                <div className="relative">
                    <label className="block text-sm font-medium text-slate-700 mb-2">
                        写下评论 (可选)
                    </label>
                    <textarea
                        className={`w-full border rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-colors text-slate-900 placeholder-slate-400 ${
                            commentSaved 
                            ? 'bg-green-50 border-green-200' 
                            : 'border-slate-300 bg-white'
                        }`}
                        rows={3}
                        placeholder="这篇文章怎么样？你的反馈将直接影响 AI 的推荐策略..."
                        value={comment}
                        onChange={e => {
                            setComment(e.target.value);
                            setCommentSaved(false);
                        }}
                        disabled={commentSaved}
                    />
                    {commentSaved && (
                        <div className="absolute top-9 right-2 text-green-600 text-xs font-bold bg-white px-2 py-1 rounded shadow-sm flex items-center gap-1">
                            ✓ 已保存
                            <button onClick={() => setCommentSaved(false)} className="underline ml-1 text-slate-400 font-normal cursor-pointer z-10 relative">修改</button>
                        </div>
                    )}
                </div>
                
                <div className="flex justify-between items-center mt-3">
                     <p className="text-xs text-slate-500">
                        * 你的评论将作为原始数据直接输入给 Gemini。
                    </p>
                    <button 
                        onClick={handleSaveComment}
                        disabled={!comment.trim() || commentSaved}
                        className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
                            !comment.trim() || commentSaved
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm'
                        }`}
                    >
                        {commentSaved ? '已发送' : '发送评论'}
                    </button>
                </div>
            </div>
            
            <div className="h-12 flex items-center justify-center text-slate-300 text-xs">
              Article ID: {article.id}
            </div>
        </div>
      </div>
    </div>
  );
};
