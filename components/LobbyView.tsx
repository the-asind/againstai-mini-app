import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Users, Cpu, Fingerprint, Crosshair, Play, AlertTriangle, Eye, Volume2, Globe, Check, Crown, ChevronDown, Settings, X, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GameState, Player, GameMode, ScenarioType, ImageGenerationMode, LobbySettings, Language, AIModelLevel, NavyUsageResponse } from '../types';
import { t, translations } from '../i18n';
import { SocketService } from '../services/socketService';

interface LobbyViewProps {
    gameState: GameState;
    user: Player | null;
    onUpdateSettings: (key: keyof LobbySettings, value: LobbySettings[keyof LobbySettings]) => void;
    onStartGame: () => void;
    onSaveSettings: (nick: string, apiKey: string, navyKey: string, lang: Language) => boolean;
    initialNick: string;
    initialApiKey: string;
    initialNavyKey: string;
    initialLang: Language;
}

// Define translation key type for safety
type TranslationKey = keyof typeof translations['en'];

// --- Configuration Constants ---

const GENRES: { id: ScenarioType, label: TranslationKey }[] = [
    { id: ScenarioType.ANY, label: 'any' },
    { id: ScenarioType.SCI_FI, label: 'scifi' },
    { id: ScenarioType.SUPERNATURAL, label: 'supernatural' },
    { id: ScenarioType.APOCALYPSE, label: 'apocalypse' },
    { id: ScenarioType.FANTASY, label: 'fantasy' },
    { id: ScenarioType.CYBERPUNK, label: 'cyberpunk' },
    { id: ScenarioType.BACKROOMS, label: 'backrooms' },
    { id: ScenarioType.SCP, label: 'scp' },
    { id: ScenarioType.MINECRAFT, label: 'minecraft' },
    { id: ScenarioType.HARRY_POTTER, label: 'harryPotter' },
];

const MODES: { id: GameMode, label: TranslationKey }[] = [
    { id: GameMode.COOP, label: 'coop' },
    { id: GameMode.PVP, label: 'pvp' },
    { id: GameMode.BATTLE_ROYALE, label: 'battleRoyale' }
];

const AI_LEVELS: { id: AIModelLevel, label: TranslationKey, desc: TranslationKey }[] = [
    { id: AIModelLevel.ECONOMY, label: 'economy', desc: 'economyDesc' },
    { id: AIModelLevel.BALANCED, label: 'balanced', desc: 'balancedDesc' },
    { id: AIModelLevel.PREMIUM, label: 'premium', desc: 'premiumDesc' },
];

const VOICE_OPTIONS: { id: 'SCENARIO' | 'RESULTS'; label: TranslationKey }[] = [
    { id: 'SCENARIO', label: 'voiceoverScenario' },
    { id: 'RESULTS', label: 'voiceoverResults' }
];

const IMAGE_OPTIONS: { id: ImageGenerationMode; label: TranslationKey }[] = [
    { id: ImageGenerationMode.NONE, label: 'imgNone' },
    { id: ImageGenerationMode.SCENARIO, label: 'imgScenario' },
    { id: ImageGenerationMode.FULL, label: 'imgFull' }
];

export const LobbyView: React.FC<LobbyViewProps> = ({
    gameState,
    user,
    onUpdateSettings,
    onStartGame,
    onSaveSettings,
    initialNick,
    initialApiKey,
    initialNavyKey,
    initialLang
}) => {
  const [isGenreDropdownOpen, setIsGenreDropdownOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Settings Modal State
  const [nickname, setNickname] = useState(initialNick);
  const [geminiKey, setGeminiKey] = useState(initialApiKey);
  const [navyKey, setNavyKey] = useState(initialNavyKey);
  const [interfaceLang, setInterfaceLang] = useState<Language>(initialLang);

  // Navy Stats State
  const [navyStats, setNavyStats] = useState<NavyUsageResponse | null>(null);

  // Aggregate Stats State
  const [aggregateStats, setAggregateStats] = useState<{ totalTokens: number, contributors: number } | null>(null);
  const [isLoadingAggregate, setIsLoadingAggregate] = useState(false);

  // Update local settings state when props change
  useEffect(() => {
      setNickname(initialNick);
      setGeminiKey(initialApiKey);
      setNavyKey(initialNavyKey);
      setInterfaceLang(initialLang);
  }, [initialNick, initialApiKey, initialNavyKey, initialLang]);

  // Effect to validate key with stale closure guard (Navy Stats)
  useEffect(() => {
      let isCancelled = false;

      if (!navyKey || navyKey.length < 10) {
          setNavyStats(null);
          return;
      }

      const timer = setTimeout(async () => {
           try {
               const stats = await SocketService.validateNavyApiKey(navyKey);
               if (!isCancelled) {
                   setNavyStats(stats);
               }
           } catch (error) {
               if (!isCancelled) {
                   setNavyStats(null);
                   console.error("Failed to validate Navy key:", error);
               }
           }
      }, 800);

      return () => {
          isCancelled = true;
          clearTimeout(timer);
      };
  }, [navyKey]);

  // Subscription for Aggregate Stats
  useEffect(() => {
      const unsub = SocketService.subscribeToNavyAggregate((data) => {
          setAggregateStats(data);
          setIsLoadingAggregate(false);
      });
      return () => unsub();
  }, []);

  const fetchAggregateStats = () => {
      if (gameState.lobbyCode && user?.isCaptain) {
          setIsLoadingAggregate(true);
          setAggregateStats(null);
          SocketService.getAggregateNavyUsage(gameState.lobbyCode);
      }
  };

  const voiceCount = navyStats ? Math.floor(navyStats.usage.tokens_remaining_today / 55000) : 0;
  const imageCount = navyStats ? Math.floor(navyStats.usage.tokens_remaining_today / 7500) : 0;

  // Helper for voice options
  const isVoiceScenario = gameState.settings.voiceoverScenario;
  const isVoiceResults = gameState.settings.voiceoverResults;

  const toggleVoice = (id: 'SCENARIO' | 'RESULTS') => {
      if (id === 'SCENARIO') onUpdateSettings('voiceoverScenario', !isVoiceScenario);
      if (id === 'RESULTS') onUpdateSettings('voiceoverResults', !isVoiceResults);
  };

  const activeGenreKey = GENRES.find(g => g.id === gameState.settings.scenarioType)?.label || 'any';
  const activeGenreLabel = t(activeGenreKey, interfaceLang);

  // Close dropdown when clicking outside
  const dropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsGenreDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSave = () => {
      const success = onSaveSettings(nickname, geminiKey, navyKey, interfaceLang);
      if (success) {
        setIsSettingsOpen(false);
      }
  };

  const handleShare = () => {
      const shareUrl = `t.me/AgainstAIBot?startapp=${gameState.lobbyCode}`;
      const shareText = `${t('shareLobbyText', interfaceLang)} \`${gameState.lobbyCode}\``;
      const fullUrl = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(shareText)}`;

      if (window.Telegram?.WebApp?.openTelegramLink) {
          window.Telegram.WebApp.openTelegramLink(fullUrl);
      } else {
          window.open(fullUrl, '_blank', 'noopener,noreferrer');
      }
  };

  const canEdit = user?.isCaptain;

  return (
    <div className="min-h-screen p-4 pb-32 font-sans selection:bg-game-accent/30 max-w-5xl mx-auto relative z-10 text-white">
      {/* Header */}
      <header className="flex items-center justify-between mb-8 border-b border-game-accent/30 pb-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <Terminal size={20} className="text-game-accent animate-pulse-fast" />
          <h1 className="text-base md:text-lg font-mono font-bold tracking-widest text-white">
            SYS.LOBBY
          </h1>
        </div>
        <div className="flex items-center gap-3 font-mono text-xs md:text-sm">
          <button
            onClick={() => setIsSettingsOpen(true)}
            aria-label="Open Settings"
            className="p-2 bg-game-panel border border-game-accent/30 text-tg-hint hover:text-game-accent hover:border-game-accent/60 transition-colors rounded-sm"
          >
            <Settings size={16} />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-tg-hint hidden sm:inline">{t('linkId', interfaceLang)}:</span>
            <button
                className="text-game-accent bg-game-accent/10 px-3 py-1.5 rounded-sm border border-game-accent/30 tracking-wider select-all cursor-pointer hover:bg-game-accent/20 transition-colors"
                onClick={handleShare}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        handleShare();
                    }
                }}
                aria-label={t('copyLink', interfaceLang)}
                tabIndex={0}
            >
                {gameState.lobbyCode}
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout - Grid on Desktop, Stack on Mobile */}
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">

        {/* LEFT COLUMN: AI DIRECTIVES (Settings) */}
        <section className="lg:col-span-7 xl:col-span-8 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-2 mb-4">
            <Cpu size={14} className="text-game-accent" />
            <h2 className="text-xs font-mono text-game-accent tracking-widest">{t('missionDirectives', interfaceLang)}</h2>
          </div>

          <div className="bg-game-panel border border-game-accent/30 p-5 md:p-6 space-y-6 relative rounded-sm shadow-lg overflow-hidden">
            <AlertTriangle size={160} className="absolute -right-10 -bottom-10 text-white/5 pointer-events-none" />

            {/* Removed Captain Only Overlay */}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Environment (Genre) - Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <div className="text-[10px] font-mono text-tg-hint mb-2 flex items-center gap-1.5">
                  <Globe size={12} /> {t('environment', interfaceLang)}
                </div>
                <button
                  onClick={() => canEdit && setIsGenreDropdownOpen(!isGenreDropdownOpen)}
                  className={`w-full flex items-center justify-between px-4 py-3 bg-black/40 border border-game-accent/30 text-tg-text font-mono text-xs hover:border-game-accent/60 transition-colors rounded-sm ${!canEdit && 'opacity-50 cursor-not-allowed'}`}
                  disabled={!canEdit}
                >
                  <span className="truncate">{activeGenreLabel}</span>
                  <ChevronDown size={14} className={`text-game-accent transition-transform duration-200 ${isGenreDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {isGenreDropdownOpen && canEdit && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.15 }}
                      className="absolute top-full left-0 right-0 mt-1 bg-game-panel border border-game-accent/40 shadow-xl z-50 max-h-60 overflow-y-auto rounded-sm"
                    >
                      {GENRES.map(g => (
                        <button
                          key={g.id}
                          onClick={() => {
                            onUpdateSettings('scenarioType', g.id);
                            setIsGenreDropdownOpen(false);
                          }}
                          className={`w-full text-left px-4 py-3 text-xs font-mono transition-colors ${
                            gameState.settings.scenarioType === g.id
                              ? 'bg-game-accent/20 text-game-accent font-bold border-l-2 border-game-accent'
                              : 'text-tg-hint hover:bg-black/40 hover:text-tg-text border-l-2 border-transparent'
                          }`}
                        >
                          {t(g.label, interfaceLang)}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Protocol (Mode) */}
              <div>
                <div className="text-[10px] font-mono text-tg-hint mb-2 flex items-center gap-1.5">
                  <Crosshair size={12} /> {t('protocol', interfaceLang)}
                </div>
                <div className="grid grid-cols-3 gap-1 bg-black/20 p-1 border border-game-accent/20 rounded-sm h-[42px]">
                  {MODES.map(m => {
                    const isActive = gameState.settings.mode === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => canEdit && onUpdateSettings('mode', m.id)}
                        disabled={!canEdit}
                        className={`relative h-full text-[10px] md:text-xs font-mono transition-colors ${
                          isActive ? 'text-tg-buttonText font-bold' : 'text-tg-hint hover:text-tg-text'
                        } ${!canEdit && !isActive ? 'opacity-50' : ''}`}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="mode-bg"
                            className="absolute inset-0 bg-game-accent/80 border border-game-accent rounded-sm"
                            initial={false}
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          />
                        )}
                        <span className="relative z-10">{t(m.label, interfaceLang)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* AI Core */}
            <div>
              <div className="text-[10px] font-mono text-tg-hint mb-2 flex items-center gap-1.5">
                <Cpu size={12} /> {t('aiCoreIntel', interfaceLang)}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {AI_LEVELS.map(level => {
                  const isActive = gameState.settings.aiModelLevel === level.id;
                  return (
                    <button
                      key={level.id}
                      onClick={() => canEdit && onUpdateSettings('aiModelLevel', level.id)}
                      disabled={!canEdit}
                      className={`relative p-3 text-left transition-colors border rounded-sm ${
                        isActive ? 'border-game-accent' : 'border-game-accent/20 bg-black/30 hover:border-game-accent/40'
                      } ${!canEdit ? 'cursor-not-allowed opacity-80' : ''}`}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="ai-bg"
                          className="absolute inset-0 bg-game-accent/10 rounded-sm"
                          initial={false}
                          transition={{ type: "spring", stiffness: 500, damping: 30 }}
                        />
                      )}
                      <div className="relative z-10">
                        <div className={`text-xs font-mono font-bold mb-1 ${isActive ? 'text-game-accent' : 'text-white'}`}>
                          {t(level.label, interfaceLang)}
                        </div>
                        <div className="text-[9px] text-tg-hint leading-tight">{t(level.desc, interfaceLang)}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sensory Output */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-game-accent/20">
              <div>
                <div className="text-[10px] font-mono text-tg-hint mb-2 flex items-center gap-1.5">
                  <Volume2 size={12} /> {t('audio', interfaceLang)}
                </div>
                <div className="space-y-2">
                  {VOICE_OPTIONS.map(opt => {
                    const isActive = opt.id === 'SCENARIO' ? isVoiceScenario : isVoiceResults;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => canEdit && toggleVoice(opt.id)}
                        disabled={!canEdit}
                        className={`relative w-full text-left px-3 py-2.5 text-[10px] md:text-xs font-mono border rounded-sm transition-colors flex justify-between items-center overflow-hidden ${
                          isActive ? 'border-game-accent text-tg-buttonText' : 'border-game-accent/20 bg-black/30 text-tg-hint hover:border-game-accent/40'
                        } ${!canEdit ? 'cursor-not-allowed opacity-80' : ''}`}
                      >
                        {isActive && (
                          <motion.div
                            layoutId={`voice-bg-${opt.id}`}
                            className="absolute inset-0 bg-game-accent"
                            initial={false}
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          />
                        )}
                        <span className="relative z-10">{t(opt.label, interfaceLang)}</span>
                        <div className={`relative z-10 w-2 h-2 rounded-full ${isActive ? 'bg-tg-buttonText' : 'bg-transparent border border-tg-hint'}`} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-mono text-tg-hint mb-2 flex items-center gap-1.5">
                  <Eye size={12} /> {t('visuals', interfaceLang)}
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {IMAGE_OPTIONS.map(opt => {
                    const isActive = gameState.settings.imageGenerationMode === opt.id;
                    const label = t(opt.label, interfaceLang);
                    return (
                      <button
                        key={opt.id}
                        onClick={() => canEdit && onUpdateSettings('imageGenerationMode', opt.id)}
                        disabled={!canEdit}
                        className={`relative px-3 py-2.5 text-[10px] md:text-xs font-mono border rounded-sm transition-colors text-left overflow-hidden ${
                          isActive ? 'border-game-accent text-tg-buttonText' : 'border-game-accent/20 bg-black/30 text-tg-hint hover:border-game-accent/40'
                        } ${!canEdit ? 'cursor-not-allowed opacity-80' : ''}`}
                      >
                        {isActive && (
                          <motion.div
                            layoutId="visual-bg"
                            className="absolute inset-0 bg-game-accent"
                            initial={false}
                            transition={{ type: "spring", stiffness: 500, damping: 30 }}
                          />
                        )}
                        <span className="relative z-10">{isActive ? `[ ${label} ]` : label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Language Toggle */}
            <div className="pt-4 border-t border-game-accent/20 flex justify-between items-center">
               <div className="text-[10px] font-mono text-tg-hint">{t('storyLanguageOverride', interfaceLang)}</div>
               <div className="flex bg-black/50 border border-game-accent/30 rounded-sm p-0.5">
                 {['ru', 'en'].map(lang => (
                   <button
                     key={lang}
                     onClick={() => canEdit && onUpdateSettings('storyLanguage', lang as Language)}
                     disabled={!canEdit}
                     className={`px-4 py-1.5 text-[10px] font-mono rounded-sm transition-colors ${
                       gameState.settings.storyLanguage === lang
                        ? 'bg-game-accent text-tg-buttonText font-bold'
                        : 'text-tg-hint hover:text-tg-text'
                     } ${!canEdit ? 'cursor-not-allowed opacity-50' : ''}`}
                   >
                     {lang.toUpperCase()}
                   </button>
                 ))}
               </div>
            </div>
          </div>
        </section>

        {/* RIGHT COLUMN: SQUAD SECTION */}
        <section className="lg:col-span-5 xl:col-span-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-mono text-game-accent tracking-widest flex items-center gap-2">
              <Users size={14} />
              {t('activeSquad', interfaceLang)}
            </h2>
            <span className="text-[10px] font-mono text-tg-hint bg-black/40 px-2 py-1 rounded-sm border border-white/5">
              {gameState.players.length} {t('connected', interfaceLang)}
            </span>
          </div>

          <div className="space-y-3">
            {gameState.players.map((player, idx) => (
              <motion.div
                key={player.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={`flex items-center justify-between p-3.5 rounded-sm border ${player.isCaptain ? 'tactical-border bg-game-panel border-game-accent/40 shadow-sm' : 'bg-black/40 border-game-accent/10'}`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                     {player.avatarUrl ? (
                         <img src={player.avatarUrl} alt={player.name} className={`w-11 h-11 rounded-sm border ${player.keyCount > 0 ? 'border-game-accent' : 'border-tg-hint'} grayscale hover:grayscale-0 transition-all`} referrerPolicy="no-referrer" />
                     ) : (
                         <div className={`w-11 h-11 rounded-sm border ${player.keyCount > 0 ? 'border-game-accent' : 'border-tg-hint'} bg-black flex items-center justify-center font-bold text-lg`} >
                             {player.name.charAt(0)}
                         </div>
                     )}

                    {player.keyCount > 0 && (
                      <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-game-accent rounded-sm border border-black flex items-center justify-center shadow-sm">
                        <Check size={10} className="text-tg-buttonText" />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                      {player.name}
                      {player.id === user?.id && <span className="text-[10px] text-tg-hint">(You)</span>}
                    </div>
                    <div className={`text-[10px] font-mono mt-0.5 ${player.keyCount > 0 ? 'text-game-accent' : 'text-tg-hint'}`}>
                      {t('status', interfaceLang)}: {player.keyCount > 0 ? t('ready', interfaceLang) : t('noKeys', interfaceLang)} {!player.isOnline && `[${t('offline', interfaceLang)}]`}
                    </div>
                  </div>
                </div>
                {player.isCaptain && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-game-accent/10 text-game-accent text-[9px] font-mono font-bold border border-game-accent/20 rounded-sm">
                    <Crown size={12} />
                    CAPTAIN
                  </div>
                )}
              </motion.div>
            ))}

            {/* Waiting Indicator - Now Clickable Share Button */}
            <motion.button
              type="button"
              layout
              onClick={handleShare}
              aria-label={t('shareLobbyText', interfaceLang)}
              className="w-full p-4 flex flex-col items-center justify-center gap-3 text-game-accent/50 border border-dashed border-game-accent/20 bg-black/20 rounded-sm mt-4 cursor-pointer hover:bg-black/30 transition-colors focus:outline-none focus:ring-1 focus:ring-game-accent/50"
            >
              <Fingerprint size={20} className="animate-pulse-fast" />
              <div className="text-[10px] font-mono text-center tracking-wide">
                {t('awaitingOperatives', interfaceLang)}
              </div>
            </motion.button>
          </div>
        </section>
      </main>

      {/* Fixed Footer Actions */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 md:p-6 bg-gradient-to-t from-tg-bg via-tg-bg to-transparent z-20 pointer-events-none">
        <div className="max-w-5xl mx-auto flex gap-3 md:gap-4 pointer-events-auto justify-end">
          {canEdit && (
              <motion.button
                whileTap={{ scale: 0.98 }}
                onClick={onStartGame}
                disabled={gameState.players.length < 2}
                className="w-full lg:w-auto lg:px-12 py-4 md:py-5 bg-game-accent text-tg-buttonText font-mono font-bold text-sm md:text-base border border-game-accent hover:opacity-90 transition-opacity flex items-center justify-center gap-2 uppercase tracking-widest tactical-border shadow-[0_0_20px_rgba(46,160,94,0.2)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play fill="currentColor" size={18} />
                {t('initiateProtocol', interfaceLang)}
              </motion.button>
          )}
          {!canEdit && (
              <div className="w-full lg:w-auto lg:px-12 py-4 md:py-5 bg-black/50 text-tg-hint font-mono text-sm border border-game-accent/20 flex items-center justify-center">
                  {t('waitingForCaptain', interfaceLang)}
              </div>
          )}

          {/* Removed dedicated Share Button - logic moved to "Awaiting Operatives" container */}
        </div>
      </footer>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
              onClick={() => setIsSettingsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-game-panel border border-game-accent/30 rounded-sm shadow-2xl overflow-hidden tactical-border"
            >
              <div className="p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-game-accent/20 pb-4">
                  <h2 className="text-lg font-mono font-bold text-white tracking-widest">{t('settingsHeader', interfaceLang)}</h2>
                  <button onClick={() => setIsSettingsOpen(false)} className="text-tg-hint hover:text-white transition-colors" aria-label="Close Settings">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Interface Language Toggle */}
                  <div className="flex items-center justify-between bg-black/40 border border-game-accent/30 rounded-sm p-2">
                    <label className="text-[10px] font-mono text-tg-hint uppercase tracking-wider ml-2">{t('interfaceLang', interfaceLang)}</label>
                    <div className="flex bg-black/50 border border-game-accent/30 rounded-sm p-0.5">
                      {['ru', 'en'].map(lang => (
                        <button
                          key={lang}
                          onClick={() => setInterfaceLang(lang as Language)}
                          className={`px-3 py-1 text-[10px] font-mono rounded-sm transition-colors ${
                            interfaceLang === lang
                              ? 'bg-game-accent text-tg-buttonText font-bold'
                              : 'text-tg-hint hover:text-tg-text'
                          }`}
                        >
                          {lang.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-tg-hint mb-2 uppercase tracking-wider">{t('callsign', interfaceLang)}</label>
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      className="w-full bg-black/40 border border-game-accent/30 rounded-sm px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-game-accent transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-tg-hint mb-2 uppercase tracking-wider">{t('api_gemini_key_required', interfaceLang)}</label>
                    <input
                      type="password"
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      className="w-full bg-black/40 border border-game-accent/30 rounded-sm px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-game-accent transition-colors"
                    />
                    <p className="text-[9px] text-tg-hint mt-1.5 font-mono">{t('apiKeyHintPrefix', interfaceLang)} <a href="https://aistudio.google.com/api-keys" target="_blank" rel="noopener noreferrer" className="text-game-accent hover:underline">{t('apiKeyLink', interfaceLang)}</a>.</p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-tg-hint mb-2 uppercase tracking-wider">{t('api_api_navy_key_optional', interfaceLang)}</label>
                    <input
                      type="password"
                      value={navyKey}
                      onChange={(e) => setNavyKey(e.target.value)}
                      className="w-full bg-black/40 border border-game-accent/30 rounded-sm px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-game-accent transition-colors"
                    />
                    <p className="text-[9px] text-tg-hint mt-1.5 font-mono">{t('api_get_free_key_at', interfaceLang)} <a href="https://api.navy" target="_blank" rel="noopener noreferrer" className="text-game-accent hover:underline">api.navy</a>.</p>

                    {/* Navy Stats Display */}
                    {navyStats && (
                     <div className="bg-black/20 p-2 rounded-sm text-[10px] space-y-1 border border-tg-hint/10 mt-2 font-mono">
                         <div className="flex justify-between">
                             <span className="text-tg-hint">{t('statsPlan', interfaceLang)}</span>
                             <span className="font-bold text-white">{navyStats.plan}</span>
                         </div>
                         <div className="flex justify-between">
                             <span className="text-tg-hint">{t('statsTokens', interfaceLang)}</span>
                             <span className={`font-bold ${navyStats.usage.tokens_remaining_today < 10000 ? 'text-red-400' : 'text-green-400'}`}>
                                 {(navyStats.usage.tokens_remaining_today / 1000).toFixed(1)}k
                             </span>
                         </div>
                         <div className="border-t border-tg-hint/10 my-1"></div>
                         <div className="flex justify-between">
                             <span className="text-tg-hint">{t('statsEstVoices', interfaceLang)}</span>
                             <span className="font-bold text-white">{voiceCount}</span>
                         </div>
                         <div className="flex justify-between">
                             <span className="text-tg-hint">{t('statsEstImages', interfaceLang)}</span>
                             <span className="font-bold text-white">{imageCount}</span>
                         </div>
                     </div>
                    )}
                  </div>

                  {/* SQUAD RESOURCES (Captain Only) */}
                  {canEdit && (
                      <div className="bg-game-accent/10 border border-game-accent/20 rounded-sm p-3 space-y-2 mt-4">
                          <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono text-game-accent uppercase tracking-wider flex items-center gap-2">
                                  <Users size={12} /> SQUAD RESOURCES
                              </span>
                              <button
                                  onClick={fetchAggregateStats}
                                  disabled={isLoadingAggregate}
                                  className="text-tg-hint hover:text-white transition-colors"
                              >
                                  <RefreshCw size={12} className={isLoadingAggregate ? 'animate-spin' : ''} />
                              </button>
                          </div>

                          {aggregateStats ? (
                              <div className="text-[10px] font-mono space-y-1">
                                  <div className="flex justify-between">
                                      <span className="text-tg-hint">Total Tokens:</span>
                                      <span className="font-bold text-white">{(aggregateStats.totalTokens / 1000).toFixed(1)}k</span>
                                  </div>
                                  <div className="flex justify-between">
                                      <span className="text-tg-hint">Contributors:</span>
                                      <span className="font-bold text-white">{aggregateStats.contributors}</span>
                                  </div>
                                  <div className="text-[9px] text-tg-hint italic mt-1 border-t border-white/10 pt-1">
                                      ~ {Math.floor(aggregateStats.totalTokens / 55000)} voices / {Math.floor(aggregateStats.totalTokens / 7500)} images total
                                  </div>
                              </div>
                          ) : (
                              <div className="text-[10px] text-tg-hint italic text-center py-2">
                                  Tap refresh to scan squad keys...
                              </div>
                          )}
                      </div>
                  )}

                </div>

                <div className="flex gap-3 pt-4 border-t border-game-accent/20">
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="flex-1 py-3 bg-black/40 border border-game-accent/30 text-tg-hint font-mono text-xs hover:text-white hover:border-game-accent/60 transition-colors rounded-sm"
                  >
                    {t('cancel', interfaceLang).toUpperCase()}
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex-1 py-3 bg-game-accent text-tg-buttonText font-mono font-bold text-xs border border-game-accent hover:opacity-90 transition-opacity rounded-sm shadow-[0_0_10px_rgba(46,160,94,0.2)]"
                  >
                    {t('saveData', interfaceLang)}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
