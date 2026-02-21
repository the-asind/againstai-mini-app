import React from 'react';

interface ToastProps {
  toast: {
    msg: string;
    type: 'success' | 'error';
  } | null;
}

export const Toast: React.FC<ToastProps> = ({ toast }) => (
  <div className={`fixed bottom-10 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-full shadow-2xl z-50 transition-all duration-300 ${toast ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5 pointer-events-none'}
    ${toast?.type === 'error' ? 'bg-red-600' : 'bg-green-600'} text-white font-bold flex items-center gap-2`}>
     {toast?.type === 'success' && (
         <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
           <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
         </svg>
     )}
     {toast?.msg}
  </div>
);
