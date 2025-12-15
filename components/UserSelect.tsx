
import React from 'react';
import { User } from '../types';
import { PREDEFINED_USERS } from '../services/db';

interface Props {
  onSelect: (user: User) => void;
}

export const UserSelect: React.FC<Props> = ({ onSelect }) => {
  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-4xl w-full">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-indigo-800 mb-2">Maze Lab</h1>
          <p className="text-slate-500 text-lg">AI 推荐策略验证实验平台</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {PREDEFINED_USERS.map(user => (
            <button
              key={user.id}
              onClick={() => onSelect(user)}
              className="group flex flex-col items-center p-6 rounded-xl border-2 border-slate-100 hover:border-indigo-400 hover:bg-indigo-50 transition-all duration-300"
            >
              <div className="relative mb-4">
                 <img 
                   src={user.avatar} 
                   alt={user.username} 
                   className="w-24 h-24 rounded-full shadow-sm bg-white group-hover:scale-110 transition-transform"
                 />
                 {user.username === 'Bob' && (
                     <span className="absolute -top-1 -right-1 bg-yellow-400 text-yellow-900 text-[10px] font-bold px-2 py-0.5 rounded-full border border-white">
                         ADMIN
                     </span>
                 )}
              </div>
              <h3 className="text-xl font-bold text-slate-800 group-hover:text-indigo-700">{user.username}</h3>
              <div className="flex gap-2 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                 <span className="text-xs text-indigo-400 font-medium">点击进入</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
