import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameStatus, Player, GameMode, LobbySettings, GameState, RoundResult, Language, ScenarioType, AIModelLevel, ImageGenerationMode, NavyUsageResponse } from './types';
import { translations, t } from './i18n';
import { DEFAULT_SETTINGS, MIN_TIME, MAX_TIME, MIN_CHARS, MAX_CHARS, STORAGE_KEYS } from './constants';
import { SocketService } from './services/socketService';
import { Button } from './components/Button';
import { Input } from './components/Input';
import { CodeInput } from './components/CodeInput';
import { MarkdownDisplay } from './components/MarkdownDisplay';
import { Toast } from './components/Toast';

// Helper to count keys
const getKeyCount = (): 0 | 1 | 2 => {
    let count = 0;
    if (localStorage.getItem(STORAGE_KEYS.API_KEY)) count++;
    if (localStorage.getItem(STORAGE_KEYS.NAVY_KEY)) count++;
    return count as 0 | 1 | 2;
};

// Extracted Components

interface SettingsModalProps {
    settingsNick: string;
    setSettingsNick: (val: string) => void;
    settingsApiKey: string;
    setSettingsApiKey: (val: string) => void;
    settingsNavyApiKey: string;
    setSettingsNavyApiKey: (val: string) => void;
    saveSettings: () => void;
    setShowSettingsModal: (val: boolean) => void;
    lang: Language;
    user: Player | null;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
    settingsNick, setSettingsNick, settingsApiKey, setSettingsApiKey,
    settingsNavyApiKey, setSettingsNavyApiKey,
    saveSettings, setShowSettingsModal, lang, user
}) => {
    // New state
    const [navyStats, setNavyStats] = useState<NavyUsageResponse | null>(null);

    // Effect to validate key with stale closure guard
    useEffect(() => {
        let isCancelled = false;

        if (!settingsNavyApiKey || settingsNavyApiKey.length < 10) {
            setNavyStats(null);
            return;
        }

        const timer = setTimeout(async () => {
             // Pass undefined code to validate just the key (or current lobby if socket knows it)
             const stats = await SocketService.validateNavyApiKey(settingsNavyApiKey);
             if (!isCancelled) {
                 setNavyStats(stats);
             }
        }, 800);

        return () => {
            isCancelled = true;
            clearTimeout(timer);
        };
    }, [settingsNavyApiKey]);

    // Calculate approximate capacities
    const voiceCount = navyStats ? Math.floor(navyStats.usage.tokens_remaining_today / 55000) : 0;
    const imageCount = navyStats ? Math.floor(navyStats.usage.tokens_remaining_today / 7500) : 0;

    return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
        <div className="bg-tg-secondaryBg w-full max-w-sm rounded-2xl p-6 border border-tg-hint/20 shadow-2xl space-y-4">
            <h3 className="text-xl font-bold text-center">{t('settingsTitle', lang)}</h3>

            <div className="space-y-2">
                <label className="text-xs text-tg-hint uppercase font-bold ml-1">{t('nickname', lang)}</label>
                <Input
                    value={settingsNick}
                    onChange={(e) => setSettingsNick(e.target.value)}
                    placeholder={t('enterNickname', lang)}
                />
            </div>

            <div className="space-y-2">
                 <label className="text-xs text-tg-hint uppercase font-bold ml-1">{t('api_gemini_key_required', lang) || "Gemini API Key (Required)"}</label>
                 <Input
                    value={settingsApiKey}
                    onChange={(e) => setSettingsApiKey(e.target.value)}
                    placeholder="AI Studio Key"
                    type="password"
                    autoComplete="off"
                 />
                 <p className="text-[10px] text-tg-hint">
                    {t('apiKeyHintPrefix', lang)} <a href="https://aistudio.google.com/api-keys" target="_blank" className="underline text-tg-link">{t('apiKeyLink', lang)}</a>.
                 </p>
            </div>

            <div className="space-y-2">
                 <label className="text-xs text-tg-hint uppercase font-bold ml-1">{t('api_api_navy_key_optional', lang) || "API.NAVY Key (Optional)"}</label>
                 <Input
                    value={settingsNavyApiKey}
                    onChange={(e) => setSettingsNavyApiKey(e.target.value)}
                    placeholder="Navy Key"
                    type="password"
                    autoComplete="off"
                 />
                 <p className="text-[10px] text-tg-hint">
                    {t('api_get_free_key_at', lang) || "Get free key at"} <a href="https://api.navy" target="_blank" className="underline text-tg-link">api.navy</a>.
                 </p>
                 {/* Navy Stats Display */}
                 {navyStats && (
                     <div className="bg-black/20 p-2 rounded text-[10px] space-y-1 border border-tg-hint/10">
                         <div className="flex justify-between">
                             <span className="text-tg-hint">Plan:</span>
                             <span className="font-bold text-tg-text">{navyStats.plan}</span>
                         </div>
                         <div className="flex justify-between">
                             <span className="text-tg-hint">Tokens:</span>
                             <span className={`font-bold ${navyStats.usage.tokens_remaining_today < 10000 ? 'text-red-400' : 'text-green-400'}`}>
                                 {(navyStats.usage.tokens_remaining_today / 1000).toFixed(1)}k
                             </span>
                         </div>
                         <div className="border-t border-tg-hint/10 my-1"></div>
                         <div className="flex justify-between">
                             <span className="text-tg-hint">Est. Voices:</span>
                             <span className="font-bold">{voiceCount}</span>
                         </div>
                         <div className="flex justify-between">
                             <span className="text-tg-hint">Est. Images:</span>
                             <span className="font-bold">{imageCount}</span>
                         </div>
                     </div>
                 )}
            </div>

            <div className="flex gap-3 pt-2">
                <Button variant="secondary" onClick={() => setShowSettingsModal(false)}>
                    {t('cancel', lang)}
                </Button>
                <Button onClick={saveSettings}>
                    {t('save', lang)}
                </Button>
            </div>
        </div>
    </div>
    );
};


const App: React.FC = () => {
  // -- Initialization & State --
  
  // 1. Load Language (Lazy Init)
  const [lang, setLangState] = useState<'en' | 'ru'>(() =>
      (localStorage.getItem(STORAGE_KEYS.LANG) as Language) || 'en'
  );

  // Wrapper to save lang on change
  const setLang = (l: Language) => {
      setLangState(l);
      localStorage.setItem(STORAGE_KEYS.LANG, l);
  };

  const [user, setUser] = useState<Player | null>(null);
  
  // 2. Load Settings (Lazy Init)
  const [initialSettings] = useState<LobbySettings>(() => {
      try {
          const saved = localStorage.getItem(STORAGE_KEYS.SETTINGS);
          if (saved) {
              return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
          }
      } catch (e) {
          console.error("Failed to parse settings", e);
      }
      return DEFAULT_SETTINGS;
  });

  // Game State
  const [gameState, setGameState] = useState<GameState>({
    lobbyCode: null,
    players: [],
    status: GameStatus.HOME,
    settings: initialSettings,
    scenario: null,
    resultsRevealed: false
  });

  // UI State
  const [actionInput, setActionInput] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Settings Modal State
  const [settingsNick, setSettingsNick] = useState('');
  const [settingsApiKey, setSettingsApiKey] = useState('');
  const [settingsNavyApiKey, setSettingsNavyApiKey] = useState('');
  
  // Toast State
  const [toast, setToast] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  // Refs needed for intervals and scrolling
  const timeLeftRef = useRef<number>(0);
  const [timeLeftDisplay, setTimeLeftDisplay] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const actionInputRef = useRef(''); // Ref for current input to avoid stale closures

  // -- Effects --

  useEffect(() => {
    const initApp = async () => {
        // Init Telegram WebApp
        const tg = window.Telegram?.WebApp;
        if (tg) {
            tg.ready();
            tg.expand();

            // Theme Params
            document.documentElement.style.setProperty('--tg-theme-bg-color', tg.themeParams.bg_color || '#1f2937'); // Fallback gray-800
            document.documentElement.style.setProperty('--tg-theme-text-color', tg.themeParams.text_color || '#ffffff');
            document.documentElement.style.setProperty('--tg-theme-hint-color', tg.themeParams.hint_color || '#9ca3af');
            document.documentElement.style.setProperty('--tg-theme-link-color', tg.themeParams.link_color || '#3b82f6');
            document.documentElement.style.setProperty('--tg-theme-button-color', tg.themeParams.button_color || '#3b82f6');
            document.documentElement.style.setProperty('--tg-theme-button-text-color', tg.themeParams.button_text_color || '#ffffff');
            document.documentElement.style.setProperty('--tg-theme-secondary-bg-color', tg.themeParams.secondary_bg_color || '#374151'); // Fallback gray-700
        }

        // Connect Socket
        SocketService.connect();

        // Load saved nickname/keys for modal
        const savedNick = localStorage.getItem(STORAGE_KEYS.NICKNAME);
        if (savedNick) setSettingsNick(savedNick);

        const savedKey = localStorage.getItem(STORAGE_KEYS.API_KEY);
        if (savedKey) setSettingsApiKey(savedKey);

        const savedNavyKey = localStorage.getItem(STORAGE_KEYS.NAVY_KEY);
        if (savedNavyKey) setSettingsNavyApiKey(savedNavyKey);

        // Auto-create player object if we have saved data
        if (savedNick) {
             const userObj = window.Telegram?.WebApp?.initDataUnsafe?.user;
             const newPlayer: Player = {
                 id: userObj?.id?.toString() || Math.random().toString(36).substr(2, 9), // Fallback ID
                 name: savedNick,
                 isCaptain: false, // Will be set by server on create
                 status: 'waiting',
                 isOnline: true,
                 keyCount: getKeyCount(),
                 avatarUrl: userObj?.username ? `https://t.me/i/userpic/320/${userObj.username}.jpg` : undefined
             };
             setUser(newPlayer);
        }
    };

    initApp();

    // Socket Subscriptions
    const unsubState = SocketService.subscribe((newState) => {
        setGameState(newState);

        // Update local player ref if changed (e.g. captain status)
        if (user) {
            const me = newState.players.find(p => p.id === user.id);
            if (me) {
                setUser(prev => prev ? ({ ...prev, ...me }) : me);
            }
        }
    });

    const unsubError = SocketService.subscribeToErrors((err) => {
        setToast({ msg: err.message, type: 'error' });
    });

    return () => {
        unsubState();
        unsubError();
    };
  }, []);

  // Timer Effect
  useEffect(() => {
     let interval: NodeJS.Timeout;
     if (gameState.status === GameStatus.PLAYER_INPUT) {
         timeLeftRef.current = gameState.settings.timeLimitSeconds;
         setTimeLeftDisplay(gameState.settings.timeLimitSeconds);

         interval = setInterval(() => {
             timeLeftRef.current -= 1;
             setTimeLeftDisplay(timeLeftRef.current);
             if (timeLeftRef.current <= 0) {
                 clearInterval(interval);
                 // Auto-submit happens via server timeout usually, but we can force it too?
                 // Let's rely on server for robust timeout handling, but client can submit partial.
                 // Actually, server handles it.
             }
         }, 1000);
     }
     return () => clearInterval(interval);
  }, [gameState.status, gameState.settings.timeLimitSeconds]);

  // Toast Auto-Hide
  useEffect(() => {
      if (toast) {
          const timer = setTimeout(() => setToast(null), 3000);
          return () => clearTimeout(timer);
      }
  }, [toast]);

  // -- Handlers --

  const handleSaveSettings = () => {
      if (!settingsNick.trim()) {
          setToast({ msg: t('nicknameRequired', lang), type: 'error' });
          return;
      }

      localStorage.setItem(STORAGE_KEYS.NICKNAME, settingsNick);

      if (settingsApiKey.trim()) {
          localStorage.setItem(STORAGE_KEYS.API_KEY, settingsApiKey);
      } else {
          localStorage.removeItem(STORAGE_KEYS.API_KEY);
      }

      if (settingsNavyApiKey.trim()) {
          localStorage.setItem(STORAGE_KEYS.NAVY_KEY, settingsNavyApiKey);
          // Also validate immediately to update server?
          SocketService.validateNavyApiKey(settingsNavyApiKey);
      } else {
          localStorage.removeItem(STORAGE_KEYS.NAVY_KEY);
      }

      // Update User Object
      const userObj = window.Telegram?.WebApp?.initDataUnsafe?.user;
      const updatedUser: Player = {
          id: userObj?.id?.toString() || (user?.id || Math.random().toString(36).substr(2, 9)),
          name: settingsNick,
          isCaptain: user?.isCaptain || false,
          status: user?.status || 'waiting',
          isOnline: true,
          keyCount: getKeyCount(),
          avatarUrl: userObj?.username ? `https://t.me/i/userpic/320/${userObj.username}.jpg` : undefined
      };

      setUser(updatedUser);
      setShowSettingsModal(false);

      // If in lobby, broadcast update
      if (gameState.lobbyCode) {
          SocketService.updatePlayer(gameState.lobbyCode, {
              name: settingsNick,
              keyCount: getKeyCount()
              // We don't send keys here, they are sent on demand
          });
      }
  };

  const handleCreateLobby = async () => {
      if (!user) {
          setShowSettingsModal(true);
          return;
      }
      // Check API Key
      if (!localStorage.getItem(STORAGE_KEYS.API_KEY)) {
           setToast({ msg: t('missingApiKey', lang), type: 'error' });
           setShowSettingsModal(true);
           return;
      }

      setLoading(true);
      try {
          await SocketService.createLobby(user, gameState.settings);
      } catch (e: any) {
          setToast({ msg: e.message || "Failed", type: 'error' });
      } finally {
          setLoading(false);
      }
  };

  const handleJoinLobby = async (code: string) => {
      if (!user) {
          setShowSettingsModal(true);
          return;
      }
      setLoading(true);
      try {
          const success = await SocketService.joinLobby(code, user);
          if (!success) setToast({ msg: t('lobbyNotFound', lang), type: 'error' });
      } catch (e: any) {
          setToast({ msg: e.message || "Failed", type: 'error' });
      } finally {
          setLoading(false);
      }
  };

  const handleUpdateSettings = (key: keyof LobbySettings, value: any) => {
      if (gameState.lobbyCode) {
          SocketService.updateSettings(gameState.lobbyCode, { [key]: value });
      } else {
          // Update local initial settings
          setGameState(prev => ({
              ...prev,
              settings: { ...prev.settings, [key]: value }
          }));
          // Save to local storage
          const newSettings = { ...gameState.settings, [key]: value };
          localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(newSettings));
      }
  };

  const handleStartGame = () => {
      if (gameState.lobbyCode) {
          SocketService.startGame(gameState.lobbyCode);
      }
  };

  const handleActionInputChange = (val: string) => {
      setActionInput(val);
      actionInputRef.current = val;
  };

  const handleSubmitAction = (force: boolean = false) => {
      if (!gameState.lobbyCode) return;

      // Validation?
      if (!force && actionInput.length < MIN_CHARS) {
          setErrorMsg(`${t('chars', lang)}: ${actionInput.length}/${MIN_CHARS}`);
          return;
      }

      setLoading(true);
      SocketService.submitAction(gameState.lobbyCode, actionInput);
      setLoading(false);
      setErrorMsg('');
  };

  const handleRevealResults = () => {
      if (gameState.lobbyCode) {
          SocketService.revealResults(gameState.lobbyCode);
      }
  };

  const handleRestart = () => {
      if (gameState.lobbyCode) {
          SocketService.resetGame(gameState.lobbyCode);
      }
  };

  const handleShare = () => {
      const link = `https://t.me/AgainstAI_Bot/app?startapp=${gameState.lobbyCode}`;
      navigator.clipboard.writeText(link);
      setToast({ msg: t('linkCopied', lang), type: 'success' });
  };

  // Interactions
  const [scenarioRevealed, setScenarioRevealed] = useState(false);
  const [textRevealed, setTextRevealed] = useState(false);

  useEffect(() => {
      if (gameState.status === GameStatus.PLAYER_INPUT) {
          setScenarioRevealed(false);
          setActionInput('');
      } else if (gameState.status === GameStatus.RESULTS) {
          setTextRevealed(false);
      }
  }, [gameState.status]);

  const handleScenarioTap = () => {
      if (!scenarioRevealed) {
          window.Telegram?.WebApp?.HapticFeedback.impactOccurred('medium');
          setScenarioRevealed(true);
      }
  };

  const handleResultsTap = () => {
       if (!textRevealed) {
           window.Telegram?.WebApp?.HapticFeedback.impactOccurred('medium');
           setTextRevealed(true);
       }
  };

  // -- Render Helpers --

  const displayedScenario = scenarioRevealed
    ? (gameState.scenario || '')
    : (gameState.scenario ? gameState.scenario.substring(0, 50) + '...' : '');

  const displayedText = textRevealed
    ? (gameState.roundResult?.story || '')
    : (gameState.roundResult?.story ? gameState.roundResult.story.substring(0, 50) + '...' : '');

  // -- Views --

  if (gameState.status === GameStatus.HOME) {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center p-6 space-y-8 animate-fade-in relative">
              {/* Settings Button */}
              <button
                onClick={() => setShowSettingsModal(true)}
                className="absolute top-4 right-4 p-2 text-tg-hint hover:text-tg-text transition-colors"
              >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
              </button>

              <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-600 drop-shadow-sm">
                  AGAINST AI
              </h1>

              <div className="w-full max-w-xs space-y-4">
                  <Button onClick={handleCreateLobby} isLoading={loading}>
                      {t('createLobby', lang)}
                  </Button>

                  <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-tg-hint/20"></span>
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-tg-bg px-2 text-tg-hint">{t('or', lang)}</span>
                      </div>
                  </div>

                  <CodeInput onComplete={handleJoinLobby} label={t('enterCode', lang)} />
              </div>

              {showSettingsModal && (
                  <SettingsModal
                      settingsNick={settingsNick} setSettingsNick={setSettingsNick}
                      settingsApiKey={settingsApiKey} setSettingsApiKey={setSettingsApiKey}
                      settingsNavyApiKey={settingsNavyApiKey} setSettingsNavyApiKey={setSettingsNavyApiKey}
                      saveSettings={handleSaveSettings} setShowSettingsModal={setShowSettingsModal}
                      lang={lang} user={user}
                  />
              )}

              {toast && <Toast message={toast.msg} type={toast.type} />}
          </div>
      );
  }

  if (gameState.status === GameStatus.LOBBY_WAITING || gameState.status === GameStatus.LOBBY_SETUP || gameState.status === GameStatus.LOBBY_STARTING) {
      return (
          <div className="min-h-screen flex flex-col p-4 animate-fade-in relative">
               {/* Header */}
               <div className="flex justify-between items-center mb-6">
                   <div className="flex flex-col">
                       <span className="text-xs text-tg-hint uppercase">{t('codeLabel', lang)}</span>
                       <span className="text-3xl font-mono font-bold tracking-widest text-tg-button select-all cursor-pointer" onClick={() => {
                           navigator.clipboard.writeText(gameState.lobbyCode || '');
                           setToast({ msg: t('linkCopied', lang), type: 'success' });
                       }}>
                           {gameState.lobbyCode}
                       </span>
                   </div>
                   <button onClick={() => setShowSettingsModal(true)} className="p-2 bg-tg-secondaryBg rounded-full">
                       ⚙️
                   </button>
               </div>

               {/* Settings Panel (Captain Only) */}
               {user?.isCaptain ? (
                  <div className="bg-tg-secondaryBg p-4 rounded-xl mb-6 space-y-4 shadow-lg border border-tg-hint/10">
                      <h3 className="text-xs font-bold text-tg-hint uppercase tracking-wider mb-2">{t('gameSettings', lang)}</h3>

                      {/* Mode & Scenario */}
                      <div className="grid grid-cols-2 gap-3">
                          <div>
                              <label className="text-[10px] text-tg-hint uppercase font-bold">{t('gameMode', lang)}</label>
                              <select
                                className="w-full bg-tg-bg p-2 rounded text-sm mt-1 border border-tg-hint/20 focus:border-tg-button outline-none"
                                value={gameState.settings.mode}
                                onChange={(e) => handleUpdateSettings('mode', e.target.value)}
                              >
                                  <option value={GameMode.COOP}>{t('coop', lang)}</option>
                                  <option value={GameMode.PVP}>{t('pvp', lang)}</option>
                                  <option value={GameMode.BATTLE_ROYALE}>{t('battleRoyale', lang)}</option>
                              </select>
                          </div>
                          <div>
                              <label className="text-[10px] text-tg-hint uppercase font-bold">{t('scenarioType', lang)}</label>
                              <select
                                className="w-full bg-tg-bg p-2 rounded text-sm mt-1 border border-tg-hint/20 focus:border-tg-button outline-none"
                                value={gameState.settings.scenarioType}
                                onChange={(e) => handleUpdateSettings('scenarioType', e.target.value)}
                              >
                                  <option value={ScenarioType.ANY}>{t('any', lang)}</option>
                                  <option value={ScenarioType.SCI_FI}>{t('scifi', lang)}</option>
                                  <option value={ScenarioType.SUPERNATURAL}>{t('supernatural', lang)}</option>
                                  <option value={ScenarioType.APOCALYPSE}>{t('apocalypse', lang)}</option>
                                  <option value={ScenarioType.FANTASY}>{t('fantasy', lang)}</option>
                                  <option value={ScenarioType.CYBERPUNK}>{t('cyberpunk', lang)}</option>
                                  <option value={ScenarioType.BACKROOMS}>{t('backrooms', lang)}</option>
                                  <option value={ScenarioType.SCP}>{t('scp', lang)}</option>
                                  <option value={ScenarioType.MINECRAFT}>{t('minecraft', lang)}</option>
                                  <option value={ScenarioType.HARRY_POTTER}>{t('harryPotter', lang)}</option>
                              </select>
                          </div>
                      </div>

                      {/* Language & AI Level */}
                      <div className="grid grid-cols-2 gap-3">
                          <div>
                              <label className="text-[10px] text-tg-hint uppercase font-bold">{t('storyLanguage', lang)}</label>
                              <select
                                className="w-full bg-tg-bg p-2 rounded text-sm mt-1 border border-tg-hint/20 focus:border-tg-button outline-none"
                                value={gameState.settings.storyLanguage || 'en'}
                                onChange={(e) => handleUpdateSettings('storyLanguage', e.target.value)}
                              >
                                  <option value="en">English</option>
                                  <option value="ru">Русский</option>
                              </select>
                          </div>
                          <div>
                              <label className="text-[10px] text-tg-hint uppercase font-bold">{t('aiLevel', lang)}</label>
                              <select
                                className="w-full bg-tg-bg p-2 rounded text-sm mt-1 border border-tg-hint/20 focus:border-tg-button outline-none"
                                value={gameState.settings.aiModelLevel}
                                onChange={(e) => handleUpdateSettings('aiModelLevel', e.target.value)}
                              >
                                  <option value={AIModelLevel.ECONOMY}>{t('economy', lang)}</option>
                                  <option value={AIModelLevel.BALANCED}>{t('balanced', lang)}</option>
                                  <option value={AIModelLevel.PREMIUM}>{t('premium', lang)}</option>
                              </select>
                          </div>
                      </div>

                      {/* Time & Chars */}
                      <div className="grid grid-cols-2 gap-3">
                           <div>
                               <label className="text-[10px] text-tg-hint uppercase font-bold flex justify-between">
                                   <span>{t('timeLimit', lang)}</span>
                                   <span>{gameState.settings.timeLimitSeconds}s</span>
                               </label>
                               <input
                                  type="range"
                                  min={MIN_TIME} max={MAX_TIME} step={10}
                                  value={gameState.settings.timeLimitSeconds}
                                  onChange={(e) => handleUpdateSettings('timeLimitSeconds', parseInt(e.target.value))}
                                  className="w-full h-2 bg-tg-bg rounded-lg appearance-none cursor-pointer mt-2"
                               />
                           </div>
                           <div>
                               <label className="text-[10px] text-tg-hint uppercase font-bold flex justify-between">
                                   <span>{t('charLimit', lang)}</span>
                                   <span>{gameState.settings.charLimit}</span>
                               </label>
                               <input
                                  type="range"
                                  min={MIN_CHARS} max={MAX_CHARS} step={100}
                                  value={gameState.settings.charLimit}
                                  onChange={(e) => handleUpdateSettings('charLimit', parseInt(e.target.value))}
                                  className="w-full h-2 bg-tg-bg rounded-lg appearance-none cursor-pointer mt-2"
                               />
                           </div>
                      </div>

                      {/* Voiceover Settings (Moved here as sibling) */}
                      <div>
                          <div className="flex justify-between text-sm mb-2">
                              <span>{t('voiceoverScenario', lang) && "Voiceover (API.NAVY)"}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 mb-4">
                               {/* Scenario Voiceover */}
                               <button
                                  onClick={() => handleUpdateSettings('voiceoverScenario', !gameState.settings.voiceoverScenario)}
                                  className={`py-2 px-1 text-[10px] font-bold uppercase rounded-lg border transition-all flex flex-col items-center justify-center text-center gap-1
                                      ${gameState.settings.voiceoverScenario
                                          ? 'bg-tg-button text-white border-transparent'
                                          : 'bg-tg-bg text-tg-hint border-tg-hint/10 hover:bg-tg-bg/80'
                                      }
                                  `}
                               >
                                   <span>{t('voiceoverScenario', lang)}</span>
                                   {gameState.settings.voiceoverScenario && <span className="text-[8px] text-yellow-300 font-bold">{t('expensive', lang)}</span>}
                               </button>

                               {/* Results Voiceover */}
                               <button
                                  onClick={() => handleUpdateSettings('voiceoverResults', !gameState.settings.voiceoverResults)}
                                  className={`py-2 px-1 text-[10px] font-bold uppercase rounded-lg border transition-all flex flex-col items-center justify-center text-center gap-1
                                      ${gameState.settings.voiceoverResults
                                          ? 'bg-tg-button text-white border-transparent'
                                          : 'bg-tg-bg text-tg-hint border-tg-hint/10 hover:bg-tg-bg/80'
                                      }
                                  `}
                               >
                                   <span>{t('voiceoverResults', lang)}</span>
                                   {gameState.settings.voiceoverResults && <span className="text-[8px] text-yellow-300 font-bold">{t('expensive', lang)}</span>}
                               </button>
                          </div>
                      </div>

                      {/* Image Generation Mode */}
                      <div>
                          <div className="flex justify-between text-sm mb-2">
                              <span>{t('imageGenerationMode', lang)}</span>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                              {(['none', 'scenario', 'full'] as ImageGenerationMode[]).map((mode) => (
                                 <button
                                    key={mode}
                                    onClick={() => handleUpdateSettings('imageGenerationMode', mode)}
                                    className={`py-2 px-1 text-[10px] font-bold uppercase rounded-lg border transition-all flex flex-col items-center justify-center text-center gap-1
                                        ${gameState.settings.imageGenerationMode === mode
                                            ? 'bg-tg-button text-white border-transparent'
                                            : 'bg-tg-bg text-tg-hint border-tg-hint/10 hover:bg-tg-bg/80'
                                        }
                                    `}
                                 >
                                     <span>
                                         {mode === 'none' && t('imgNone', lang)}
                                         {mode === 'scenario' && t('imgScenario', lang)}
                                         {mode === 'full' && t('imgFull', lang)}
                                     </span>
                                     <span className="text-[8px] opacity-70 normal-case leading-tight max-w-full overflow-hidden text-ellipsis">
                                         {mode === 'none' && t('imgNoneDesc', lang)}
                                         {mode === 'scenario' && t('imgScenarioDesc', lang)}
                                         {mode === 'full' && t('imgFullDesc', lang)}
                                     </span>
                                 </button>
                              ))}
                          </div>
                      </div>
                  </div>
               ) : (
                  // Read-Only Settings for Non-Captains
                  <div className="bg-tg-secondaryBg p-4 rounded-xl mb-6 text-center shadow border border-tg-hint/10">
                      <p className="text-sm text-tg-hint">{t('lobbySetup', lang)}</p>
                      <div className="flex justify-center gap-4 mt-2">
                          <span className="px-2 py-1 bg-tg-bg rounded text-xs border border-tg-hint/20">
                              {gameState.settings.mode === GameMode.COOP && t('coop', lang)}
                              {gameState.settings.mode === GameMode.PVP && t('pvp', lang)}
                              {gameState.settings.mode === GameMode.BATTLE_ROYALE && t('battleRoyale', lang)}
                          </span>
                          <span className="px-2 py-1 bg-tg-bg rounded text-xs border border-tg-hint/20">{gameState.settings.timeLimitSeconds}s</span>
                      </div>
                  </div>
               )}

              <h3 className="text-xs font-bold text-tg-hint uppercase tracking-wider mb-2">{t('players', lang)}</h3>
              <div className="grid grid-cols-1 gap-2">
                  {gameState.players.map((p) => (
                      <div key={p.id} className={`flex items-center p-3 rounded-lg bg-tg-secondaryBg border ${p.id === user?.id ? 'border-tg-button' : 'border-transparent'} ${!p.isOnline ? 'opacity-50' : ''}`}>
                          {p.avatarUrl ? (
                              <img src={p.avatarUrl} className="w-8 h-8 rounded-full mr-3" />
                          ) : (
                              <div className="w-8 h-8 rounded-full bg-tg-bg flex items-center justify-center mr-3 text-xs font-bold">
                                  {p.name.charAt(0)}
                              </div>
                          )}
                          <div className="flex flex-col">
                              <span className="text-sm font-bold">{p.name} {p.id === user?.id && '(You)'}</span>
                              <div className="flex space-x-1">
                                  <div className={`w-2 h-2 rounded-full ${p.keyCount > 0 ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                  {p.keyCount === 2 && <div className="w-2 h-2 rounded-full bg-blue-500"></div>}
                              </div>
                          </div>
                          {!p.isOnline && <span className="ml-2 text-xs text-red-500 font-bold">[OFFLINE]</span>}
                          {p.isCaptain && <span className="ml-auto text-xs text-yellow-500">👑 Captain</span>}
                      </div>
                  ))}
              </div>

              <div className="space-y-3 mt-6">
                 {/* Navy Warning */}
                 {(gameState.settings.voiceoverScenario || gameState.settings.voiceoverResults) &&
                  !gameState.players.some(p => (p.navyUsage?.tokens || 0) >= 55000) && (
                     <div className="bg-yellow-500/20 border border-yellow-500/50 p-3 rounded-lg text-xs text-yellow-200 animate-pulse flex items-center gap-2">
                         <span className="text-xl">⚠️</span>
                         <span>{t("warning_low_tokens", lang) || "Voiceover enabled but no player has enough Navy tokens (need 55k+)."}</span>
                     </div>
                 )}

                 {user?.isCaptain ? (
                     <Button
                        onClick={handleStartGame}
                        disabled={gameState.players.length < 2 || !localStorage.getItem(STORAGE_KEYS.API_KEY)}
                        className={!localStorage.getItem(STORAGE_KEYS.API_KEY) ? 'opacity-50' : ''}
                     >
                        {gameState.status === GameStatus.LOBBY_STARTING ? t('loading', lang) : t('startGame', lang)}
                     </Button>
                 ) : (
                     <p className="text-center text-tg-hint animate-pulse">
                         {gameState.status === GameStatus.LOBBY_STARTING ? t('game_starting', lang) : t('waitingForPlayers', lang)}
                     </p>
                 )}
                 <Button variant="secondary" onClick={handleShare}>
                     {t('shareInvite', lang)}
                 </Button>
              </div>

              {showSettingsModal && (
                  <SettingsModal
                      settingsNick={settingsNick} setSettingsNick={setSettingsNick}
                      settingsApiKey={settingsApiKey} setSettingsApiKey={setSettingsApiKey}
                      settingsNavyApiKey={settingsNavyApiKey} setSettingsNavyApiKey={setSettingsNavyApiKey}
                      saveSettings={handleSaveSettings} setShowSettingsModal={setShowSettingsModal}
                      lang={lang} user={user}
                  />
              )}
              {toast && <Toast message={toast.msg} type={toast.type} />}
          </div>
      );
  }

  if (gameState.status === GameStatus.SCENARIO_GENERATION) {
      return (
          <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center space-y-6">
              <div className="w-16 h-16 border-4 border-tg-button border-t-transparent rounded-full animate-spin"></div>
              <h2 className="text-2xl font-bold animate-pulse">{t('generatingScenario', lang)}</h2>
              <p className="text-tg-hint text-sm">{t('geminiThinking', lang)}</p>
          </div>
      );
  }

  if (gameState.status === GameStatus.PLAYER_INPUT) {
      const totalTime = gameState.settings.timeLimitSeconds;
      const timeLeft = timeLeftDisplay;

      // Calculate Low Time Thresholds: 10% or 60s (whichever is smaller), 5% or 30s (whichever is smaller)
      // This caps the visual effect duration for long games while preserving percentage for short games.
      const isLowTime = timeLeft <= Math.min(60, totalTime * 0.1);
      const isCriticalTime = timeLeft <= Math.min(30, totalTime * 0.05);
      const isVeryCritical = timeLeft <= 3;

      return (
          <div className={`min-h-screen flex flex-col p-4 relative transition-colors duration-500 ${isCriticalTime ? 'bg-red-900/20 animate-pulse-red' : ''} ${isVeryCritical ? 'animate-shake' : ''}`}>

              {/* Timer - Only show when revealed */}
              <div className={`flex justify-between items-center mb-4 bg-tg-secondaryBg p-3 rounded-lg sticky top-0 z-10 shadow-lg transition-all duration-300 ${scenarioRevealed ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'} ${isLowTime ? 'animate-shake' : ''}`}>
                  <span className={`text-sm font-bold ${isCriticalTime ? 'text-red-500 animate-pulse' : 'text-tg-hint'}`}>{t('timeLeft', lang)}</span>
                  <span className={`text-2xl font-mono font-bold ${isCriticalTime ? 'text-red-600 animate-pulse' : 'text-tg-text'}`}>{timeLeftDisplay}s</span>
              </div>

              <div
                  className="bg-gradient-to-b from-gray-900 to-gray-800 p-5 rounded-2xl border border-gray-700 shadow-xl mb-6 transition-all active:scale-[0.98]"
                  onClick={handleScenarioTap}
              >
                  {gameState.scenarioImage && (
                      <div className="mb-4 rounded-xl overflow-hidden shadow-lg border border-gray-600">
                          <img src={gameState.scenarioImage} alt="Scenario" className="w-full h-auto object-cover" />
                      </div>
                  )}
                  {gameState.scenarioAudio && (
                      <div className="mb-4 w-full">
                          <audio controls autoPlay src={gameState.scenarioAudio} className="w-full h-8" />
                      </div>
                  )}
                  <h3 className="text-tg-hint text-xs uppercase tracking-widest mb-2">{t('situation', lang)}</h3>
                  <MarkdownDisplay content={displayedScenario} />
                  {!scenarioRevealed && <span className="animate-pulse inline-block w-2 h-4 bg-tg-button ml-1 align-middle"></span>}
              </div>

              {/* Input Area - Fade in when revealed */}
              <div className={`flex-grow flex flex-col space-y-2 transition-opacity duration-500 ${scenarioRevealed ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                  <label className="text-sm text-tg-hint">{t('submitAction', lang)}</label>
                  <textarea 
                    className="w-full flex-grow bg-tg-secondaryBg p-4 rounded-xl border border-tg-hint/20 focus:border-tg-button focus:outline-none resize-none transition-colors focus:ring-1 focus:ring-tg-button"
                    placeholder={t('placeholderAction', lang)}
                    value={actionInput}
                    onChange={(e) => handleActionInputChange(e.target.value)}
                    disabled={!scenarioRevealed || user?.status === 'ready'}
                    maxLength={gameState.settings.charLimit}
                  />
                  <div className="flex justify-between text-xs text-tg-hint px-1">
                      <span>{actionInput.length} / {gameState.settings.charLimit}</span>
                      {errorMsg && <span className="text-red-500 font-bold">{errorMsg}</span>}
                  </div>
              </div>

              <div className={`mt-4 pb-4 transition-opacity duration-500 ${scenarioRevealed ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                  {user?.status === 'ready' ? (
                      <Button disabled className="bg-green-600 text-white">{t('actionSubmitted', lang)}</Button>
                  ) : (
                      <Button onClick={() => handleSubmitAction(false)} isLoading={loading}>
                          {t('submit', lang)}
                      </Button>
                  )}
              </div>
          </div>
      );
  }

  if (gameState.status === GameStatus.JUDGING) {
     return (
        <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center space-y-6">
            <div className="flex space-x-2">
                <div className="w-4 h-4 bg-tg-button rounded-full animate-bounce"></div>
                <div className="w-4 h-4 bg-tg-button rounded-full animate-bounce delay-100"></div>
                <div className="w-4 h-4 bg-tg-button rounded-full animate-bounce delay-200"></div>
            </div>
            <h2 className="text-2xl font-bold">{t('judging', lang)}</h2>
            <p className="text-tg-hint">{t('analyzing', lang)}</p>
        </div>
     );
  }

  if (gameState.status === GameStatus.RESULTS && gameState.roundResult) {
      return (
          <div className="min-h-screen flex flex-col p-4">
              <h2 className="text-3xl font-black mb-6 text-center">{t('results', lang)}</h2>
              
              {gameState.roundResult?.image && (
                  <div className="mb-6 rounded-2xl overflow-hidden shadow-2xl border border-tg-hint/20">
                      <img src={gameState.roundResult.image} alt="Result" className="w-full h-auto object-cover" />
                  </div>
              )}

              {gameState.roundResult?.audio && (
                  <div className="mb-6 w-full">
                      <audio controls autoPlay src={gameState.roundResult.audio} className="w-full h-8" />
                  </div>
              )}
              <div
                  className="bg-tg-secondaryBg p-5 rounded-2xl mb-6 shadow-lg border border-tg-hint/10 min-h-[200px]"
                  onClick={handleResultsTap}
              >
                  <MarkdownDisplay content={displayedText} />
                  {!textRevealed && !gameState.resultsRevealed && <span className="animate-pulse inline-block w-2 h-4 bg-tg-button ml-1 align-middle"></span>}
              </div>

               {/* Captain Show Button */}
               {user?.isCaptain && textRevealed && !gameState.resultsRevealed && (
                   <div className="mb-6 animate-fade-in">
                       <Button onClick={handleRevealResults} className="bg-yellow-600 text-white animate-pulse">
                           SHOW RESULTS
                       </Button>
                   </div>
               )}

              {gameState.resultsRevealed && (
                  <div className="space-y-3 mb-8 animate-fade-in">
                      <h3 className="text-sm font-bold text-tg-hint uppercase">{t('statusReport', lang)}</h3>
                      {gameState.players.map((p, index) => {
                          const deathInfo = gameState.roundResult!.deaths.find(d => d.playerId === p.id);
                          return (
                              <div
                                key={p.id}
                                className={`flex items-center justify-between p-3 rounded-lg border animate-slide-up ${deathInfo ? 'border-red-900 bg-red-900/10' : 'border-green-900 bg-green-900/10'}`}
                                style={{ animationDelay: `${index * 100}ms` }}
                              >
                                  <span className="font-bold">{p.name}</span>
                                  <span className={`text-xs font-bold px-2 py-1 rounded ${deathInfo ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
                                      {deathInfo ? (deathInfo.reason || t('died', lang)) : t('survived', lang)}
                                  </span>
                              </div>
                          );
                      })}
                  </div>
              )}

              {gameState.resultsRevealed && (
                <Button onClick={handleRestart} className="mt-auto mb-6">
                    {t('playAgain', lang)}
                </Button>
              )}
          </div>
      );
  }

  return <div className="p-10 text-center">{t('loading', lang)}</div>;
};

export default App;
