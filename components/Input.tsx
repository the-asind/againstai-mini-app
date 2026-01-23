import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input: React.FC<InputProps> = ({ label, className = '', ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block text-sm text-tg-hint mb-1 ml-1">{label}</label>}
      <input 
        className={`w-full bg-tg-secondaryBg text-tg-text border border-tg-hint/30 rounded-lg p-3 focus:outline-none focus:border-tg-button ${className}`}
        {...props}
      />
    </div>
  );
};