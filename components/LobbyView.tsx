import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Users, Cpu, Fingerprint, Crosshair, Share2, Play, AlertTriangle, Eye, Volume2, Globe, Check, Crown, ChevronDown, Settings, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GameState, Player, GameMode, ScenarioType, ImageGenerationMode, LobbySettings } from '../types';

interface LobbyViewProps {
    gameState: GameState;
    user: Player | null;
    onUpdateSettings: (key: keyof LobbySettings, value: any) => void;
    onStartGame: () => void;
    onSaveSettings: (nick: string, apiKey: string, navyKey: string, lang: 'en' | 'ru') => void;
    initialNick: string;
    initialApiKey: string;
    initialNavyKey: string;
    initialLang: 'en' | 'ru';
}

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
  const [interfaceLang, setInterfaceLang] = useState<'en'|'ru'>(initialLang);

  // Update local settings state when props change (if needed, e.g. external update)
  useEffect(() => {
      setNickname(initialNick);
      setGeminiKey(initialApiKey);
      setNavyKey(initialNavyKey);
      setInterfaceLang(initialLang);
  }, [initialNick, initialApiKey, initialNavyKey, initialLang]);

  const genres = [
    { id: ScenarioType.ANY, label: '🎲 Any / Случайно' },
    { id: ScenarioType.SCI_FI, label: 'Sci-Fi / Космос' },
    { id: ScenarioType.SUPERNATURAL, label: 'Supernatural / Сверхъестественное' },
    { id: ScenarioType.APOCALYPSE, label: 'Apocalypse / Апокалипсис' },
    { id: ScenarioType.FANTASY, label: 'Dark Fantasy / Темное Фэнтези' },
    { id: ScenarioType.CYBERPUNK, label: 'Cyberpunk / Киберпанк' },
    { id: ScenarioType.BACKROOMS, label: 'Backrooms / Закулисье' },
    { id: ScenarioType.SCP, label: 'SCP Foundation' },
    { id: ScenarioType.MINECRAFT, label: 'Minecraft' },
    { id: ScenarioType.HARRY_POTTER, label: 'Harry Potter / Гарри Поттер' },
  ];

  const modes = [
      { id: GameMode.COOP, label: 'COOP' },
      { id: GameMode.PVP, label: 'PVP' },
      { id: GameMode.BATTLE_ROYALE, label: 'ROYALE' }
  ];

  const aiLevels = [
    { id: 'economy', label: 'LITE', desc: 'Fast / Low Cost' },
    { id: 'balanced', label: 'CORE', desc: 'Balanced Logic' },
    { id: 'premium', label: 'PRO', desc: 'Max Intelligence' },
  ];

  // Helper for voice options
  const isVoiceScenario = gameState.settings.voiceoverScenario;
  const isVoiceResults = gameState.settings.voiceoverResults;

  const toggleVoice = (opt: 'SCENARIO' | 'RESULTS') => {
      if (opt === 'SCENARIO') onUpdateSettings('voiceoverScenario', !isVoiceScenario);
      if (opt === 'RESULTS') onUpdateSettings('voiceoverResults', !isVoiceResults);
  };

  const activeGenreLabel = genres.find(g => g.id === gameState.settings.scenarioType)?.label || 'Unknown';

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
      onSaveSettings(nickname, geminiKey, navyKey, interfaceLang);
      setIsSettingsOpen(false);
  };

  const handleShare = () => {
      const link = `https://t.me/AgainstAI_Bot/app?startapp=${gameState.lobbyCode}`;
      navigator.clipboard.writeText(link);
      // Ideally show toast
      alert('Link copied to clipboard');
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
            className="p-2 bg-game-panel border border-game-accent/30 text-tg-hint hover:text-game-accent hover:border-game-accent/60 transition-colors rounded-sm"
          >
            <Settings size={16} />
          </button>
          <div className="flex items-center gap-2">
            <span className="text-tg-hint hidden sm:inline">LINK_ID:</span>
            <span className="text-game-accent bg-game-accent/10 px-3 py-1.5 rounded-sm border border-game-accent/30 tracking-wider select-all cursor-pointer" onClick={handleShare}>
                {gameState.lobbyCode}
            </span>
          </div>
        </div>
      </header>

      {/* Main Layout - Grid on Desktop, Stack on Mobile */}
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">

        {/* LEFT COLUMN: AI DIRECTIVES (Settings) */}
        <section className="lg:col-span-7 xl:col-span-8 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center gap-2 mb-4">
            <Cpu size={14} className="text-game-accent" />
            <h2 className="text-xs font-mono text-game-accent tracking-widest">MISSION DIRECTIVES</h2>
          </div>

          <div className="bg-game-panel border border-game-accent/30 p-5 md:p-6 space-y-6 relative rounded-sm shadow-lg">
            <AlertTriangle size={160} className="absolute -right-10 -bottom-10 text-game-accent/5 pointer-events-none" />

            {/* Captain Only Overlay for Non-Captains */}
            {!canEdit && (
                <div className="absolute inset-0 z-40 bg-black/50 backdrop-blur-[1px] flex items-center justify-center rounded-sm">
                    <div className="bg-black/80 border border-game-accent/50 p-4 rounded text-center">
                        <Crown size={24} className="mx-auto mb-2 text-yellow-500" />
                        <p className="text-xs font-mono text-tg-hint uppercase">Awaiting Captain Configuration...</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Environment (Genre) - Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <div className="text-[10px] font-mono text-tg-hint mb-2 flex items-center gap-1.5">
                  <Globe size={12} /> ENVIRONMENT
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
                      {genres.map(g => (
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
                          {g.label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Protocol (Mode) */}
              <div>
                <div className="text-[10px] font-mono text-tg-hint mb-2 flex items-center gap-1.5">
                  <Crosshair size={12} /> PROTOCOL
                </div>
                <div className="grid grid-cols-3 gap-1 bg-black/20 p-1 border border-game-accent/20 rounded-sm h-[42px]">
                  {modes.map(m => {
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
                        <span className="relative z-10">{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* AI Core */}
            <div>
              <div className="text-[10px] font-mono text-tg-hint mb-2 flex items-center gap-1.5">
                <Cpu size={12} /> AI CORE INTEL
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {aiLevels.map(level => {
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
                          {level.label}
                        </div>
                        <div className="text-[9px] text-tg-hint leading-tight">{level.desc}</div>
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
                  <Volume2 size={12} /> AUDIO
                </div>
                <div className="space-y-2">
                  {[
                      { id: 'SCENARIO', label: 'SCENARIO', active: isVoiceScenario },
                      { id: 'RESULTS', label: 'RESULTS', active: isVoiceResults }
                  ].map(opt => {
                    const isActive = opt.active;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => canEdit && toggleVoice(opt.id as any)}
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
                        <span className="relative z-10">{opt.label}</span>
                        <div className={`relative z-10 w-2 h-2 rounded-full ${isActive ? 'bg-tg-buttonText' : 'bg-transparent border border-tg-hint'}`} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="text-[10px] font-mono text-tg-hint mb-2 flex items-center gap-1.5">
                  <Eye size={12} /> VISUALS
                </div>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { id: ImageGenerationMode.NONE, label: 'OFF' },
                    { id: ImageGenerationMode.SCENARIO, label: 'SCENARIO ONLY' },
                    { id: ImageGenerationMode.FULL, label: 'FULL RENDER' }
                  ].map(opt => {
                    const isActive = gameState.settings.imageGenerationMode === opt.id;
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
                        <span className="relative z-10">{isActive ? `[ ${opt.label} ]` : opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Language Toggle */}
            <div className="pt-4 border-t border-game-accent/20 flex justify-between items-center">
               <div className="text-[10px] font-mono text-tg-hint">STORY LANGUAGE OVERRIDE</div>
               <div className="flex bg-black/50 border border-game-accent/30 rounded-sm p-0.5">
                 {['ru', 'en'].map(lang => (
                   <button
                     key={lang}
                     onClick={() => canEdit && onUpdateSettings('storyLanguage', lang)}
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
              ACTIVE SQUAD
            </h2>
            <span className="text-[10px] font-mono text-tg-hint bg-black/40 px-2 py-1 rounded-sm border border-white/5">
              {gameState.players.length} CONNECTED
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
                      STATUS: {player.keyCount > 0 ? 'READY' : 'NO KEYS'} {!player.isOnline && '[OFFLINE]'}
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

            {/* Waiting Indicator */}
            <motion.div
              layout
              className="p-4 flex flex-col items-center justify-center gap-3 text-game-accent/50 border border-dashed border-game-accent/20 bg-black/20 rounded-sm mt-4"
            >
              <Fingerprint size={20} className="animate-pulse-fast" />
              <div className="text-[10px] font-mono text-center tracking-wide">
                AWAITING OPERATIVES...
              </div>
            </motion.div>
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
                disabled={gameState.players.length < 1} // Should be < 2 but for testing < 1 is ok? No logic says < 2
                className="w-full lg:w-auto lg:px-12 py-4 md:py-5 bg-game-accent text-tg-buttonText font-mono font-bold text-sm md:text-base border border-game-accent hover:opacity-90 transition-opacity flex items-center justify-center gap-2 uppercase tracking-widest tactical-border shadow-[0_0_20px_rgba(46,160,94,0.2)]"
              >
                <Play fill="currentColor" size={18} />
                Initiate Protocol
              </motion.button>
          )}
          {!canEdit && (
              <div className="w-full lg:w-auto lg:px-12 py-4 md:py-5 bg-black/50 text-tg-hint font-mono text-sm border border-game-accent/20 flex items-center justify-center">
                  WAITING FOR CAPTAIN...
              </div>
          )}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleShare}
            className="w-14 md:w-16 flex items-center justify-center bg-game-panel border border-game-accent/30 text-game-accent hover:bg-game-accent/10 transition-colors rounded-sm"
          >
            <Share2 size={20} />
          </motion.button>
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
                  <h2 className="text-lg font-mono font-bold text-white tracking-widest">SETTINGS</h2>
                  <button onClick={() => setIsSettingsOpen(false)} className="text-tg-hint hover:text-white transition-colors">
                    <X size={20} />
                  </button>
                </div>

                <div className="space-y-4">
                  {/* Interface Language Toggle */}
                  <div className="flex items-center justify-between bg-black/40 border border-game-accent/30 rounded-sm p-2">
                    <label className="text-[10px] font-mono text-tg-hint uppercase tracking-wider ml-2">INTERFACE LANG</label>
                    <div className="flex bg-black/50 border border-game-accent/30 rounded-sm p-0.5">
                      {['ru', 'en'].map(lang => (
                        <button
                          key={lang}
                          onClick={() => setInterfaceLang(lang as any)}
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
                    <label className="block text-[10px] font-mono text-tg-hint mb-2 uppercase tracking-wider">CALLSIGN (NICKNAME)</label>
                    <input
                      type="text"
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      className="w-full bg-black/40 border border-game-accent/30 rounded-sm px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-game-accent transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-tg-hint mb-2 uppercase tracking-wider">GEMINI API KEY (REQUIRED)</label>
                    <input
                      type="password"
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      className="w-full bg-black/40 border border-game-accent/30 rounded-sm px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-game-accent transition-colors"
                    />
                    <p className="text-[9px] text-tg-hint mt-1.5 font-mono">Get free key at <a href="https://aistudio.google.com/api-keys" target="_blank" className="text-game-accent hover:underline">aistudio.google.com</a>.</p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono text-tg-hint mb-2 uppercase tracking-wider">API.NAVY KEY (OPTIONAL)</label>
                    <input
                      type="password"
                      value={navyKey}
                      onChange={(e) => setNavyKey(e.target.value)}
                      className="w-full bg-black/40 border border-game-accent/30 rounded-sm px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-game-accent transition-colors"
                    />
                    <p className="text-[9px] text-tg-hint mt-1.5 font-mono">Get key at: <a href="https://api.navy" target="_blank" className="text-game-accent hover:underline">api.navy</a>.</p>
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-game-accent/20">
                  <button
                    onClick={() => setIsSettingsOpen(false)}
                    className="flex-1 py-3 bg-black/40 border border-game-accent/30 text-tg-hint font-mono text-xs hover:text-white hover:border-game-accent/60 transition-colors rounded-sm"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={handleSave}
                    className="flex-1 py-3 bg-game-accent text-tg-buttonText font-mono font-bold text-xs border border-game-accent hover:opacity-90 transition-opacity rounded-sm shadow-[0_0_10px_rgba(46,160,94,0.2)]"
                  >
                    SAVE DATA
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
