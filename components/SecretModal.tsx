import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Fingerprint, Lock, ShieldAlert } from 'lucide-react';
import { MarkdownDisplay } from './MarkdownDisplay';

interface SecretModalProps {
  secret: string;
  onClose: () => void;
  lang: 'en' | 'ru';
}

export const SecretModal: React.FC<SecretModalProps> = ({ secret, onClose, lang }) => {
  const [progress, setProgress] = useState(100);
  const totalTime = 20000; // 20 seconds
  const intervalTime = 100; // update every 100ms

  // Use Ref to avoid resetting interval when onClose changes identity
  const onCloseRef = useRef(onClose);
  useEffect(() => {
      onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev - (intervalTime / totalTime) * 100;
        if (next <= 0) {
          clearInterval(timer);
          onCloseRef.current(); // Use ref here
          return 0;
        }
        return next;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, []); // Empty dependency array = timer doesn't reset

  const isUrgent = progress < 15; // Last 3 seconds (approx 15%)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="w-full max-w-md bg-game-panel border border-red-500/30 shadow-[0_0_50px_rgba(220,38,38,0.2)] rounded-sm overflow-hidden relative"
      >
        {/* Header */}
        <div className="bg-red-900/20 p-4 border-b border-red-500/30 flex items-center gap-3">
          <ShieldAlert className="text-red-500 animate-pulse" size={24} />
          <h2 className="text-red-500 font-mono font-bold tracking-widest text-lg">
            {lang === 'ru' ? 'СЕКРЕТНЫЙ ПРОТОКОЛ' : 'SECRET PROTOCOL'}
          </h2>
        </div>

        {/* Content */}
        <div className="p-6 relative">
          <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
            <Lock size={120} />
          </div>

          <div className="relative z-10 min-h-[150px] flex items-center justify-center">
             <MarkdownDisplay content={secret} className="text-center font-mono text-sm md:text-base leading-relaxed" />
          </div>
        </div>

        {/* Footer / Progress Button */}
        <div className="p-4 bg-black/40 border-t border-red-500/20">
          <button
            onClick={onClose}
            className={`w-full relative h-12 bg-red-900/30 border border-red-500/50 rounded-sm overflow-hidden group hover:bg-red-900/50 transition-colors ${isUrgent ? 'animate-shake' : ''}`}
          >
            {/* Progress Bar Background */}
            <div
                className="absolute inset-0 bg-red-600/20 origin-left transition-transform duration-100 ease-linear"
                style={{ transform: `scaleX(${progress / 100})` }}
            />

            <div className="relative z-10 flex items-center justify-center gap-2 text-red-100 font-mono font-bold tracking-wider group-hover:text-white">
              <Fingerprint size={16} />
              <span>{lang === 'ru' ? 'ПОДТВЕРДИТЬ И УНИЧТОЖИТЬ' : 'ACKNOWLEDGE & DESTROY'}</span>
            </div>
          </button>
          <div className="text-center mt-2 text-[10px] text-red-500/50 font-mono">
             {lang === 'ru' ? 'Сообщение будет удалено автоматически...' : 'Message will self-destruct...'}
          </div>
        </div>
      </motion.div>
    </div>
  );
};
