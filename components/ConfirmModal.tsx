import React from 'react';

interface Props {
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<Props> = ({ 
  message, 
  title = '确认操作',
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel 
}) => {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="text-3xl">❓</div>
            <div className="flex-1">
              <h3 className="font-bold text-lg mb-2 text-slate-800">{title}</h3>
              <p className="text-slate-700 whitespace-pre-wrap">{message}</p>
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-6 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium border border-slate-300"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

