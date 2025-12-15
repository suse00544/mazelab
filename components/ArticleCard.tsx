
import React from 'react';
import { Article } from '../types';

interface Props {
  article: Article;
  onClick: () => void;
}

export const ArticleCard: React.FC<Props> = ({ article, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className="bg-white border border-slate-200 rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer mb-4 animate-[fadeIn_0.5s_ease-out] overflow-hidden"
    >
      {article.imageUrl && (
          <div className="h-40 w-full overflow-hidden bg-slate-100">
              <img src={article.imageUrl} alt={article.title} className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" />
          </div>
      )}
      <div className="p-5">
        <div className="flex justify-start items-start mb-2">
            <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded">{article.category}</span>
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">{article.title}</h3>
        <p className="text-slate-600 line-clamp-2">{article.summary}</p>
      </div>
    </div>
  );
};
