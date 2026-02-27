import React, { useEffect } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'motion/react';
import { LoadingPhase, WheelConfig, VotingConfig, VotingResults, RoundType } from '../types';
import { Crosshair, Users, CheckCircle2, Crown, Timer } from 'lucide-react';
import { t } from '../i18n';

interface InteractiveLoadingScreenProps {
  phase: LoadingPhase;
  wheelConfig?: WheelConfig;
  votingConfig?: VotingConfig;
  votingResults?: VotingResults;
  loadingText: string;
  onVote: (candidateId: string) => void;
  onWheelSpinComplete: () => void;
  lang?: 'en' | 'ru';
}

const Explosion = ({ type }: { type: RoundType }) => {
  const isBoss = type === 'BOSS_FIGHT';
  const color = isBoss ? '#ef4444' : '#eab308';
  const particleCount = isBoss ? 50 : 30;

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-0">
      {Array.from({ length: particleCount }).map((_, i) => {
        const angle = (i / particleCount) * Math.PI * 2 + (Math.random() * 0.2 - 0.1);
        const velocity = isBoss ? 150 + Math.random() * 300 : 100 + Math.random() * 200;
        const tx = Math.cos(angle) * velocity;
        const ty = Math.sin(angle) * velocity;
        const scale = Math.random() * 1.5 + 0.5;

        return (
          <motion.div
            key={i}
            initial={{ x: 0, y: 0, scale: 0, opacity: 1 }}
            animate={{
              x: tx,
              y: ty,
              scale: scale,
              opacity: 0
            }}
            transition={{
              duration: isBoss ? 1.5 + Math.random() * 0.5 : 1 + Math.random() * 0.5,
              ease: isBoss ? "circOut" : "easeOut",
            }}
            className="absolute w-2 h-2 rounded-full"
            style={{
              backgroundColor: color,
              boxShadow: `0 0 10px ${color}`,
              filter: isBoss ? 'blur(1px)' : 'none'
            }}
          />
        );
      })}
      {isBoss && (
        <motion.div
          initial={{ scale: 0, opacity: 0.8 }}
          animate={{ scale: 6, opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          className="absolute w-32 h-32 bg-red-600 rounded-full blur-[40px]"
        />
      )}
    </div>
  );
};

export const InteractiveLoadingScreen: React.FC<InteractiveLoadingScreenProps> = ({
  phase,
  wheelConfig,
  votingConfig,
  votingResults,
  loadingText,
  onVote,
  onWheelSpinComplete,
  lang = 'ru'
}) => {
  const wheelRotation = useMotionValue(0);

  const pointerAngle = useTransform(wheelRotation, (r) => {
    if (!wheelConfig) return 0;
    const degPerSegment = 360 / wheelConfig.segments.length;
    const phase = r % degPerSegment;

    // The pin hits the pointer as phase approaches degPerSegment
    const hitZoneStart = degPerSegment - 3; // Starts lifting earlier for a round pin
    if (phase > hitZoneStart) {
      const progress = (phase - hitZoneStart) / (degPerSegment - hitZoneStart);
      // Smooth lift using sine wave
      return -35 * Math.sin(progress * Math.PI / 2);
    }
    // Snaps back slowly and bounces
    const returnZone = 6;
    if (phase < returnZone) {
      const progress = phase / returnZone;
      // Elastic return
      return -35 * Math.pow(1 - progress, 2) * Math.cos(progress * Math.PI * 2.5);
    }
    return 0;
  });

  useEffect(() => {
    if (phase === 'WHEEL' && wheelConfig) {
      const degPerSegment = 360 / wheelConfig.segments.length;

      // Random offset between 15% and 85% of the segment to avoid stopping exactly on a pin
      const randomOffset = (Math.random() * 0.9 + 0.05) * degPerSegment;
      const targetAngle = wheelConfig.targetIndex * degPerSegment + randomOffset;

      const spins = 12; // Increased spins for more momentum
      const finalRotation = spins * 360 + (360 - targetAngle);

      const controls = animate(wheelRotation, finalRotation, {
        duration: 4.5, // much faster spin!
        ease: [0.1, 0.9, 0.1, 1], // Custom curve for very slow tail
        onComplete: onWheelSpinComplete
      });

      return controls.stop;
    }
  }, [phase, wheelConfig, onWheelSpinComplete, wheelRotation]);

  const targetSegment = wheelConfig?.segments[wheelConfig.targetIndex];

  const renderWheel = () => {
    if (!wheelConfig) return null;

    const { segments, targetIndex } = wheelConfig;
    const degPerSegment = 360 / segments.length; // 18 for 20 segments

    let gradient: string[] = [];
    let currentAngle = 0;
    segments.forEach(seg => {
      gradient.push(`${seg.color} ${currentAngle}deg ${currentAngle + degPerSegment}deg`);
      currentAngle += degPerSegment;
    });
    const conicGradient = `conic-gradient(${gradient.join(', ')})`;
    const shadowOverlay = `repeating-conic-gradient(from 0deg, rgba(255,255,255,0.2) 0deg, rgba(255,255,255,0) 1deg, transparent calc(${degPerSegment}deg - 2deg), rgba(0,0,0,0.4) calc(${degPerSegment}deg - 0.5deg), rgba(0,0,0,0.8) ${degPerSegment}deg)`;

    // Calculate final rotation
    const targetCenterAngle = targetIndex * degPerSegment + (degPerSegment / 2);
    const spins = 8;
    const finalRotation = spins * 360 + (360 - targetCenterAngle);

    return (
      <motion.div
        key="wheel"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 flex flex-col items-center justify-start pt-16 md:pt-24 pointer-events-none"
      >
        <div className="text-center z-10 space-y-2 relative">
          <h3 className="text-tg-button font-mono text-lg md:text-xl tracking-widest uppercase flex items-center justify-center gap-2">
            <Crosshair size={20} />
            {t('analyzing', lang) || "Анализ вероятностей"}
          </h3>
          <p className="text-tg-hint text-xs md:text-sm font-mono">{loadingText}</p>
        </div>

        {/* Giant Wheel Container */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-[60%] w-[160vh] h-[160vh] max-w-none pointer-events-auto">

          {/* Pointer */}
          <motion.div
            className="absolute top-0 left-1/2 z-30 origin-top"
            style={{ x: "-50%", y: -10, rotate: pointerAngle }}
          >
            <div className="w-0 h-0 border-l-[12px] border-l-transparent border-r-[12px] border-r-transparent border-t-[35px] border-t-white drop-shadow-[0_0_10px_rgba(255,255,255,1)]" />
          </motion.div>

          {/* Wheel */}
          <motion.div
            className="w-full h-full rounded-full border-[10px] border-tg-secondaryBg shadow-[0_0_80px_rgba(0,0,0,0.8)] relative overflow-hidden"
            style={{ background: conicGradient, rotate: wheelRotation }}
          >
            {/* Segment Shadows Overlay */}
            <div className="absolute inset-0 rounded-full pointer-events-none" style={{ background: shadowOverlay }} />

            {/* Noise Texture Overlay */}
            <div
              className="absolute inset-0 rounded-full pointer-events-none opacity-30 mix-blend-overlay"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
              }}
            />

            {/* 3D Overlay */}
            <div className="absolute inset-0 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.8) 100%)', boxShadow: 'inset 0 0 50px rgba(0,0,0,0.9)' }} />

            {/* Boss Glows */}
            {segments.map((seg, i) => {
              if (seg.type !== 'BOSS_FIGHT') return null;
              return (
                <div key={`glow-${i}`} className="absolute top-0 left-1/2 w-48 h-1/2 origin-bottom -translate-x-1/2 pointer-events-none" style={{ transform: `rotate(${i * degPerSegment + degPerSegment / 2}deg)` }}>
                  <div className="absolute top-[10%] left-1/2 -translate-x-1/2 w-full h-1/3 bg-red-500/60 blur-[30px] rounded-full animate-pulse" />
                </div>
              );
            })}

            {/* Segments Text */}
            {segments.map((seg, i) => {
              const isBoss = seg.type === 'BOSS_FIGHT';
              return (
                <div key={`text-${i}`} className="absolute top-0 left-1/2 w-8 h-1/2 origin-bottom -translate-x-1/2" style={{ transform: `rotate(${i * degPerSegment + degPerSegment / 2}deg)` }}>
                  <div className="absolute top-[12%] md:top-[15%] left-1/2 -translate-x-1/2 flex items-center justify-center">
                    <span
                      className={`font-mono font-black uppercase tracking-widest whitespace-nowrap ${isBoss ? 'text-red-100 text-2xl md:text-4xl animate-pulse' : 'text-white/90 text-lg md:text-2xl'}`}
                      style={{
                        transform: 'rotate(90deg)',
                        transformOrigin: 'center',
                        textShadow: isBoss ? '0 0 15px #ef4444, 0 0 30px #ef4444' : '0 2px 6px rgba(0,0,0,0.9)'
                      }}
                    >
                      {seg.label}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Inner Hub */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1/4 h-1/4 bg-tg-secondaryBg rounded-full border-8 border-gray-800 shadow-inner flex items-center justify-center">
              <div className="w-1/2 h-1/2 rounded-full border-4 border-tg-button/30 flex items-center justify-center">
                <div className="w-4 h-4 bg-tg-button rounded-full animate-pulse" />
              </div>
            </div>
          </motion.div>

          {/* Pins (Outside overflow-hidden so they don't get clipped) */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{ rotate: wheelRotation }}
          >
            {segments.map((_, i) => (
              <div key={`pin-${i}`} className="absolute top-0 left-1/2 w-4 h-1/2 origin-bottom -translate-x-1/2" style={{ transform: `rotate(${i * degPerSegment}deg)` }}>
                <div className="w-4 h-4 md:w-5 md:h-5 rounded-full mt-1 md:mt-1.5 mx-auto shadow-[0_2px_5px_rgba(0,0,0,0.8)] border border-gray-400" style={{ background: 'radial-gradient(circle at 30% 30%, #fff, #888)' }} />
              </div>
            ))}
          </motion.div>
        </div>
      </motion.div>
    );
  };

  const renderShowResult = () => {
    if (!targetSegment) return null;
    const isBoss = targetSegment.type === 'BOSS_FIGHT';
    const isSpecial = targetSegment.type === 'SPECIAL';

    return (
      <motion.div
        key="show_result"
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 1.2, opacity: 0 }}
        transition={{ type: 'spring', damping: 12, stiffness: 100 }}
        className="flex flex-col items-center justify-center h-full space-y-6 z-10 relative"
      >
        {(isBoss || isSpecial) && <Explosion type={targetSegment.type} />}

        <h2 className="text-tg-hint font-mono text-lg md:text-xl tracking-widest uppercase relative z-10">{lang === 'ru' ? 'Выбранный этап' : 'Selected Stage'}</h2>
        <motion.div
          animate={isBoss ? {
            scale: [1, 1.05, 1],
            textShadow: [`0 0 40px ${targetSegment.color}`, `0 0 80px ${targetSegment.color}`, `0 0 40px ${targetSegment.color}`]
          } : {}}
          transition={{ duration: 0.5, repeat: Infinity }}
          className="text-5xl md:text-7xl font-black uppercase tracking-tighter text-center px-4 relative z-10"
          style={{ color: targetSegment.color, textShadow: `0 0 40px ${targetSegment.color}` }}
        >
          {targetSegment.label}
        </motion.div>
      </motion.div>
    );
  };

  const renderVoting = () => {
    if (!votingConfig) return null;

    return (
      <motion.div
        key="voting"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="w-full max-w-md mx-auto space-y-6 z-10 mt-20"
      >
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-tg-button/10 border border-tg-button/30 rounded-sm text-tg-button text-[10px] font-mono uppercase tracking-widest">
            <Users size={12} />
            {lang === 'ru' ? 'Социальный протокол' : 'Social Protocol'}
          </div>
          <h2 className="text-lg md:text-xl font-bold text-tg-text leading-tight">
            {votingConfig.question}
          </h2>
          <div className="flex items-center justify-center gap-2 text-tg-hint text-xs font-mono">
            <Timer size={14} />
            {lang === 'ru' ? 'Осталось:' : 'Remaining:'} {votingConfig.timeLeft} {lang === 'ru' ? 'сек' : 'sec'}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 w-full">
          {votingConfig.candidates.map(candidate => {
            const isSelected = votingConfig.myVoteId === candidate.id;
            const hasVoted = votingConfig.myVoteId !== null;

            return (
              <button
                key={candidate.id}
                onClick={() => !hasVoted && onVote(candidate.id)}
                disabled={hasVoted}
                className={`flex items-center gap-4 p-3 rounded-sm border transition-all ${isSelected
                  ? 'bg-tg-button/20 border-tg-button shadow-[0_0_15px_rgba(46,160,94,0.2)] text-tg-button'
                  : hasVoted
                    ? 'bg-black/40 border-white/5 opacity-50 cursor-not-allowed'
                    : 'bg-tg-secondaryBg border-tg-button/20 hover:border-tg-button/50 hover:bg-black/60'
                  }`}
              >
                {/* Fallback avatar if none provided */}
                {candidate.avatarUrl ? (
                  <img src={candidate.avatarUrl} alt={candidate.name} className="w-10 h-10 rounded-sm grayscale" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-10 h-10 rounded-sm bg-black/50 border border-white/10 flex items-center justify-center font-bold text-white uppercase grayscale">
                    {candidate.name.substring(0, 2)}
                  </div>
                )}
                <span className={`font-mono text-sm ${isSelected ? 'text-tg-button font-bold' : 'text-tg-text'}`}>
                  {candidate.name}
                </span>
                {isSelected && <CheckCircle2 size={16} className="ml-auto text-tg-button" />}
              </button>
            );
          })}
        </div>
      </motion.div>
    );
  };

  const renderResults = () => {
    if (!votingConfig || !votingResults) return null;

    return (
      <motion.div
        key="results"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="w-full max-w-md mx-auto space-y-6 z-10 mt-20"
      >
        <div className="text-center space-y-2">
          <h3 className="text-tg-button font-mono text-sm tracking-widest uppercase">{lang === 'ru' ? 'Итоги голосования' : 'Voting Results'}</h3>
          <p className="text-tg-text text-sm">{votingConfig.question}</p>
        </div>

        <div className="space-y-3 w-full">
          {votingConfig.candidates.map(candidate => {
            const votes = votingResults.votesDistribution[candidate.id] || 0;
            const isWinner = candidate.id === votingResults.winnerId;
            const totalVotes = Object.values(votingResults.votesDistribution).reduce((a, b) => a + b, 0);
            const percentage = totalVotes > 0 ? (votes / totalVotes) * 100 : 0;

            return (
              <div key={candidate.id} className={`relative p-3 rounded-sm border overflow-hidden ${isWinner ? 'border-tg-button bg-tg-button/10' : 'border-white/10 bg-black/40'}`}>
                {/* Progress bar background */}
                <div
                  className={`absolute inset-y-0 left-0 opacity-20 ${isWinner ? 'bg-tg-button' : 'bg-white'}`}
                  style={{ width: `${percentage}%`, transition: 'width 1s ease-out' }}
                />

                <div className="relative z-10 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {candidate.avatarUrl ? (
                      <img src={candidate.avatarUrl} alt={candidate.name} className={`w-8 h-8 rounded-sm ${isWinner ? '' : 'grayscale'}`} referrerPolicy="no-referrer" />
                    ) : (
                      <div className={`w-8 h-8 rounded-sm bg-black/50 border flex items-center justify-center font-bold text-white uppercase ${isWinner ? 'border-tg-button' : 'border-white/10 grayscale'}`}>
                        {candidate.name.substring(0, 2)}
                      </div>
                    )}
                    <span className={`font-mono text-sm ${isWinner ? 'text-tg-button font-bold' : 'text-tg-text'}`}>
                      {candidate.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-tg-hint">{votes} {lang === 'ru' ? 'голосов' : 'votes'}</span>
                    {isWinner && <Crown size={14} className="text-tg-button" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>
    );
  };

  return (
    <div className="fixed inset-0 z-[999] bg-tg-bg flex flex-col items-center justify-center p-4 overflow-hidden">
      {/* Background effects */}
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-tg-button blur-[150px]" />

      {/* Top Banner for Voting Phases */}
      <AnimatePresence>
        {(phase === 'VOTING' || phase === 'VOTING_RESULTS') && targetSegment && (
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -50, opacity: 0 }}
            className="absolute top-0 left-0 right-0 bg-black/80 border-b border-white/10 p-4 flex flex-col items-center justify-center gap-1 backdrop-blur-md z-20"
          >
            <span className="text-tg-hint font-mono text-[10px] tracking-widest uppercase">{lang === 'ru' ? 'Текущий этап' : 'Current Stage'}</span>
            <span className="font-mono font-bold text-lg uppercase tracking-wider" style={{ color: targetSegment.color, textShadow: `0 0 10px ${targetSegment.color}` }}>
              {targetSegment.label}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 w-full flex items-center justify-center relative z-10">
        <AnimatePresence mode="wait">
          {phase === 'WHEEL' && renderWheel()}
          {phase === 'SHOW_RESULT' && renderShowResult()}
          {phase === 'VOTING' && renderVoting()}
          {phase === 'VOTING_RESULTS' && renderResults()}
        </AnimatePresence>
      </div>

      {/* Footer Loading Text */}
      <AnimatePresence>
        {phase !== 'WHEEL' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="w-full max-w-md mt-8 pt-4 z-10 relative"
          >
            <div className="flex items-center gap-3 text-tg-button bg-tg-button/5 p-3 rounded-sm border border-tg-button/10 overflow-hidden">
              <div className="w-2 h-2 bg-tg-button rounded-full animate-pulse shrink-0 z-10 shadow-[0_0_8px_rgba(46,160,94,0.8)]" />
              <div className="flex-1 relative h-4 flex items-center">
                <AnimatePresence mode="wait">
                  <motion.span
                    key={loadingText}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    transition={{ duration: 0.2 }}
                    className="font-mono text-xs tracking-widest uppercase absolute left-0"
                  >
                    {loadingText}
                  </motion.span>
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
