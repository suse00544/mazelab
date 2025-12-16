
import React from 'react';

interface Props {
  content: string;
}

export const MarkdownRenderer: React.FC<Props> = ({ content }) => {
  if (!content) return <div className="text-slate-400 italic">暂无内容</div>;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];

  let inList = false;
  let listItems: React.ReactNode[] = [];

  const flushList = () => {
      if (inList) {
          elements.push(
            <ul key={`ul-${elements.length}`} className="list-disc pl-5 mb-4 space-y-1 marker:text-slate-400">
                {listItems}
            </ul>
          );
          listItems = [];
          inList = false;
      }
  };

  const parseInline = (text: string) => {
      // Parse **bold** and images ![alt](url)
      const parts = text.split(/(\*\*.*?\*\*|!\[.*?\]\(.*?\))/g);
      return parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
              return <strong key={i} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>;
          }
          // Image syntax: ![alt](url)
          const imgMatch = part.match(/^!\[(.*?)\]\((.*?)\)$/);
          if (imgMatch) {
              const [, alt, src] = imgMatch;
              // Handle local /uploads/ paths - use backend server
              const imgSrc = src.startsWith('/uploads/') ? `http://localhost:3001${src}` : src;
              return (
                <img 
                  key={i} 
                  src={imgSrc} 
                  alt={alt} 
                  className="max-w-full h-auto rounded-lg my-4 shadow-sm"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              );
          }
          return part;
      });
  };

  lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      // Headers
      if (trimmed.startsWith('# ')) {
          flushList();
          elements.push(<h1 key={index} className="text-2xl font-bold text-slate-900 mt-8 mb-4 border-b border-slate-100 pb-2">{parseInline(trimmed.slice(2))}</h1>);
      } else if (trimmed.startsWith('## ')) {
          flushList();
          elements.push(<h2 key={index} className="text-xl font-bold text-slate-800 mt-6 mb-3">{parseInline(trimmed.slice(3))}</h2>);
      } else if (trimmed.startsWith('### ')) {
          flushList();
          elements.push(<h3 key={index} className="text-lg font-bold text-slate-800 mt-5 mb-2">{parseInline(trimmed.slice(4))}</h3>);
      } 
      // Lists
      else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          inList = true;
          listItems.push(<li key={index} className="text-slate-700 leading-relaxed pl-1">{parseInline(trimmed.slice(2))}</li>);
      } 
      // Empty lines (act as spacers)
      else if (trimmed === '') {
          flushList();
      } 
      // Paragraphs
      else {
          flushList();
          elements.push(<p key={index} className="text-slate-700 leading-7 mb-4 whitespace-pre-wrap">{parseInline(line)}</p>);
      }
  });
  
  flushList(); // Final flush

  return <div className="markdown-renderer font-sans">{elements}</div>;
};
