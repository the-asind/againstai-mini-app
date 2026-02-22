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

    // Effect to validate key
    useEffect(() => {
        if (!settingsNavyApiKey || settingsNavyApiKey.length < 10) {
            setNavyStats(null);
            return;
        }
        const timer = setTimeout(async () => {
             const stats = await SocketService.validateNavyApiKey(settingsNavyApiKey);
             setNavyStats(stats);
        }, 800);
        return () => clearTimeout(timer);
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

  // Drag Scroll State
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const scrollLeftRef = useRef(0);

  // Text Reveal State
  const [displayedText, setDisplayedText] = useState('');
  const [textRevealed, setTextRevealed] = useState(false);
  const [revealSpeedMultiplier, setRevealSpeedMultiplier] = useState(1);
  const tapCountRef = useRef(0);
  // Scenario Reveal State
  const [displayedScenario, setDisplayedScenario] = useState("");
  const [scenarioRevealed, setScenarioRevealed] = useState(false);
  const [scenarioRevealSpeed, setScenarioRevealSpeed] = useState(1);
  const scenarioTapCountRef = useRef(0);

  // Helper for Haptics to avoid v6.0 crash
  const triggerHaptic = (type: 'error' | 'success' | 'warning' | 'medium') => {
    const tg = window.Telegram.WebApp;
    if (tg.isVersionAtLeast && tg.isVersionAtLeast('6.1')) {
       if (type === 'medium') {
           tg.HapticFeedback.impactOccurred('medium');
       } else {
           tg.HapticFeedback.notificationOccurred(type);
       }
    }
  };

  // Sync state to ref
  const handleActionInputChange = (val: string) => {
      setActionInput(val);
      actionInputRef.current = val;
  };

  // -- Effects --

  // Toast Timer
  useEffect(() => {
    if (toast) {
        const timer = setTimeout(() => setToast(null), 3000);
        return () => clearTimeout(timer);
    }
  }, [toast]);

  // Horizontal Scroll Fix for Mouse Wheel
  useEffect(() => {
      const el = scrollContainerRef.current;
      if (el) {
          const handleWheel = (e: WheelEvent) => {
              if (e.deltaY !== 0) {
                  // Prevent vertical page scroll, scroll horizontally instead
                  e.preventDefault();
                  el.scrollLeft += e.deltaY;
              }
          };
          // passive: false is required to preventDefault
          el.addEventListener('wheel', handleWheel, { passive: false });
          return () => el.removeEventListener('wheel', handleWheel);
      }
  }, [gameState.status]); // Re-bind if view changes

  // Initialize Telegram Web App & Load Persistence
  useEffect(() => {
    const tg = window.Telegram.WebApp;
    tg.ready();
    tg.expand();
    
    const initData = tg.initDataUnsafe;
    const userId = initData.user?.id.toString() || 'guest_' + Math.floor(Math.random() * 1000);
    const tgFirstName = initData.user?.first_name || 'Survivor';
    
    // Load persisted inputs
    const storedNick = localStorage.getItem(STORAGE_KEYS.NICKNAME) || tgFirstName;
    const initialKeyCount = getKeyCount();

    // Default User State
    const playerObj: Player = {
      id: userId,
      name: storedNick,
      isCaptain: false,
      status: 'waiting',
      isOnline: true,
      keyCount: initialKeyCount
    };
    setUser(playerObj);

    // If no local override, use TG language
    if (!localStorage.getItem(STORAGE_KEYS.LANG) && initData.user?.language_code === 'ru') {
        setLang('ru');
    }

    // Subscribe to Socket Updates
    const unsubscribe = SocketService.subscribe((newState) => {
      setGameState((prevState) => {
        // Handle Transition to Input: Reset Timer locally
        // We use prevState to avoid closure staleness issues
        if (newState.status === GameStatus.PLAYER_INPUT && prevState.status !== GameStatus.PLAYER_INPUT) {
            timeLeftRef.current = newState.settings.timeLimitSeconds;
            setTimeLeftDisplay(newState.settings.timeLimitSeconds);
            // Reset input on new round
            setActionInput("");
            actionInputRef.current = "";
        }
        return newState;
      });
    });

    const unsubscribeErrors = SocketService.subscribeToErrors((err) => {
         setToast({ msg: err.message, type: 'error' });
         triggerHaptic('error');
    });

    // Deep Linking Check (Delayed to ensure socket connection or handled in connect)
    if (initData.start_param) {
      handleJoinLobby(initData.start_param, playerObj);
    }

    return () => {
        unsubscribe();
        unsubscribeErrors();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset text reveal on new round/state change
  useEffect(() => {
     if (gameState.status !== GameStatus.RESULTS) {
         setDisplayedText("");
         setTextRevealed(false);
         setRevealSpeedMultiplier(1);
         tapCountRef.current = 0;
     }
     if (gameState.status !== GameStatus.PLAYER_INPUT) {
         setDisplayedScenario("");
         setScenarioRevealed(false);
         setScenarioRevealSpeed(1);
         scenarioTapCountRef.current = 0;
     }
  }, [gameState.status]);

  // Force reveal if server says so
  useEffect(() => {
      if (gameState.status === GameStatus.RESULTS && gameState.resultsRevealed && gameState.roundResult) {
          if (!textRevealed) {
              setDisplayedText(gameState.roundResult.story);
              setTextRevealed(true);
          }
      }
  }, [gameState.status, gameState.resultsRevealed, gameState.roundResult, textRevealed]);

  // Scenario Typewriter Effect
  useEffect(() => {
      if (gameState.status === GameStatus.PLAYER_INPUT && gameState.scenario) {
          const fullText = gameState.scenario;
          if (scenarioRevealed || displayedScenario.length >= fullText.length) {
              if (!scenarioRevealed) setScenarioRevealed(true);
              return;
          }

          const baseSpeed = 30; // ms per char
          // Clamp speed to prevent 0ms or negative timeout
          // Min timeout 5ms
          const currentSpeed = Math.max(baseSpeed / scenarioRevealSpeed, 5);

          const timer = setTimeout(() => {
              setDisplayedScenario(fullText.slice(0, displayedScenario.length + 1));
          }, currentSpeed);

          return () => clearTimeout(timer);
      }
  }, [gameState.status, gameState.scenario, displayedScenario, scenarioRevealed, scenarioRevealSpeed]);

  // Typewriter Effect
  useEffect(() => {
      if (gameState.status === GameStatus.RESULTS && gameState.roundResult) {
          const fullText = gameState.roundResult.story;

          if (textRevealed || displayedText.length >= fullText.length) {
              if (!textRevealed) setTextRevealed(true);
              return;
          }

          // Don't run effect if already revealed by server (handled by other effect)
          if (gameState.resultsRevealed) return;

          const baseSpeed = 30; // ms per char
          const currentSpeed = baseSpeed / revealSpeedMultiplier;

          const timer = setTimeout(() => {
              setDisplayedText(fullText.slice(0, displayedText.length + 1));
          }, currentSpeed);

          return () => clearTimeout(timer);
      }
  }, [gameState.status, gameState.roundResult, displayedText, textRevealed, revealSpeedMultiplier, gameState.resultsRevealed]);


  // -- Handlers --

  const handleScenarioTap = () => {
      if (scenarioRevealed) return;
      if (!user?.isCaptain) return;

      scenarioTapCountRef.current += 1;

      // Skip threshold: 9 taps (3 triple-taps)
      if (scenarioTapCountRef.current >= 9) {
           setScenarioRevealed(true);
           setDisplayedScenario(gameState.scenario || "");
           triggerHaptic("rigid"); // "Heavy" haptic
           scenarioTapCountRef.current = 0;
           return;
      }

      if (scenarioTapCountRef.current % 3 === 0) {
          setScenarioRevealSpeed(prev => prev * 1.5);
          triggerHaptic("medium");
      }
  };

  const handleResultsTap = () => {
      if (textRevealed || gameState.resultsRevealed) return;

      tapCountRef.current += 1;
      if (tapCountRef.current % 3 === 0) {
          setRevealSpeedMultiplier(prev => prev * 1.5);
          triggerHaptic('medium');
      }
  };

  const handleRevealResults = () => {
      if (!gameState.lobbyCode) return;
      SocketService.revealResults(gameState.lobbyCode);
  };

  // DRAG SCROLL HANDLERS (Mouse Drag Logic)
  const handleMouseDown = (e: React.MouseEvent) => {
      if (!scrollContainerRef.current) return;
      setIsDragging(true);
      startX.current = e.pageX - scrollContainerRef.current.offsetLeft;
      scrollLeftRef.current = scrollContainerRef.current.scrollLeft;
  };

  const handleMouseLeave = () => {
      setIsDragging(false);
  };

  const handleMouseUp = () => {
      setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDragging || !scrollContainerRef.current) return;
      e.preventDefault();
      const x = e.pageX - scrollContainerRef.current.offsetLeft;
      const walk = (x - startX.current) * 1.5; // Scroll speed multiplier
      scrollContainerRef.current.scrollLeft = scrollLeftRef.current - walk;
  };


  const handleCreateLobby = async () => {
    setErrorMsg('');
    if (!user) return;

    setLoading(true);

    const currentKeyCount = getKeyCount();

    // Use current persisted settings
    const lobbySettings: LobbySettings = { 
      ...gameState.settings
      // apiKey removed
    };

    try {
        // Skip validation for instant creation
        const newUser = { ...user, isCaptain: true, keyCount: currentKeyCount };
        await SocketService.createLobby(newUser, lobbySettings);
        // Only update user state on success
        setUser(newUser);
    } catch (e: any) {
        setErrorMsg(e.toString());
    } finally {
        setLoading(false);
    }
  };

  const handleJoinLobby = async (code: string, playerObj = user) => {
    if (!code || !playerObj) return;
    
    // Ensure name is consistent
    const storedNick = localStorage.getItem(STORAGE_KEYS.NICKNAME) || playerObj.name;
    const currentKeyCount = getKeyCount();

    const updatedPlayerObj = { ...playerObj, name: storedNick, keyCount: currentKeyCount };
    setUser(updatedPlayerObj);

    setErrorMsg('');
    setLoading(true);
    
    try {
        const success = await SocketService.joinLobby(code, updatedPlayerObj);
        if (!success) {
            setErrorMsg(t('lobbyNotFound', lang));
            triggerHaptic('error');
        }
    } catch (e) {
        setErrorMsg(t('lobbyNotFound', lang)); // Generic error for now
        triggerHaptic('error');
    } finally {
        setLoading(false);
    }
  };

  const handleUpdateSettings = <K extends keyof LobbySettings>(key: K, value: LobbySettings[K]) => {
      // 1. Update Backend
      if (gameState.lobbyCode) {
         SocketService.updateSettings(gameState.lobbyCode, { [key]: value });
      }
      
      // 2. Persist to Local Storage (Merge with current)
      const newSettings = { ...gameState.settings, [key]: value };
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(newSettings));
  };

  const handleShare = () => {
    const url = `https://t.me/AgainstAiBot?startapp=${gameState.lobbyCode}`;
    const text = `Join my lobby in Against AI! Code: ${gameState.lobbyCode}`;
    const fullTgUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;

    if (window.Telegram.WebApp.initData) {
        window.Telegram.WebApp.openTelegramLink(fullTgUrl);
    } else {
        navigator.clipboard.writeText(url);
        triggerHaptic('success');
        setToast({ msg: t('linkCopied', lang), type: 'success' });
    }
  };

  const handleStartGame = async () => {
    if (!gameState.lobbyCode) return;

    // Client-side check for API Key before start (for Captain)
    // Check local storage
    if (user?.isCaptain && !localStorage.getItem(STORAGE_KEYS.API_KEY)) {
        setToast({ msg: "Please set a valid Gemini API Key in Settings first!", type: 'error' });
        triggerHaptic('error');
        return;
    }

    SocketService.startGame(gameState.lobbyCode);
  };

  // Timer Logic
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (gameState.status === GameStatus.PLAYER_INPUT) {
      interval = setInterval(() => {
        timeLeftRef.current -= 1;
        setTimeLeftDisplay(timeLeftRef.current);

        // Haptics for last 3 seconds
        if (timeLeftRef.current <= 3 && timeLeftRef.current > 0) {
             triggerHaptic('warning');
        }

        if (timeLeftRef.current <= 0) {
           clearInterval(interval);
           // Auto-submit logic is handled by server timeout.
           // But we can submit partial text if we want to be safe.
           // Use Ref to avoid stale closure
           if (actionInputRef.current.trim()) {
               handleSubmitAction(true);
           }
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState.status]);

  const handleSubmitAction = async (force = false) => {
    if (!user || !gameState.lobbyCode) return;

    // Use Ref for latest input
    let currentInput = actionInputRef.current.trim();

    if (!currentInput && !force) return;

    setLoading(true);

    if (force) {
        if (!currentInput) {
            currentInput = t('frozenInFear', lang);
        }
        currentInput += t('timeOutNote', lang);
    }

    // Server performs cheat detection now
    SocketService.submitAction(gameState.lobbyCode, currentInput);

    // Optimistic Update
    setUser(prev => prev ? ({ ...prev, status: 'ready' }) : null);

    setLoading(false);
  };

  const handleRestart = () => {
      if (!gameState.lobbyCode) return;
      handleActionInputChange("");
      setErrorMsg("");
      SocketService.resetGame(gameState.lobbyCode);
  };

  // Settings Modal Handlers
  const openSettings = () => {
      setSettingsNick(user?.name || '');
      setSettingsApiKey(localStorage.getItem(STORAGE_KEYS.API_KEY) || '');
      setSettingsNavyApiKey(localStorage.getItem(STORAGE_KEYS.NAVY_KEY) || '');
      setShowSettingsModal(true);
  };

  const saveSettings = () => {
      const cleanNick = settingsNick.trim();
      const cleanKey = settingsApiKey.trim();
      const cleanNavyKey = settingsNavyApiKey.trim();

      if (!cleanNick) {
          setToast({ msg: t('nicknameRequired', lang), type: 'error' });
          return;
      }

      // 1. Save Nickname
      localStorage.setItem(STORAGE_KEYS.NICKNAME, cleanNick);

      // 2. Save API Keys
      if (cleanKey) localStorage.setItem(STORAGE_KEYS.API_KEY, cleanKey);
      else localStorage.removeItem(STORAGE_KEYS.API_KEY);

      if (cleanNavyKey) localStorage.setItem(STORAGE_KEYS.NAVY_KEY, cleanNavyKey);
      else localStorage.removeItem(STORAGE_KEYS.NAVY_KEY);

      const newKeyCount = getKeyCount();

      // 3. Update Player State on Server
      if (user && gameState.lobbyCode) {
          SocketService.updatePlayer(gameState.lobbyCode, {
              name: cleanNick,
              keyCount: newKeyCount
          });
          setUser({ ...user, name: cleanNick, keyCount: newKeyCount });
      }

      setShowSettingsModal(false);
      setToast({ msg: t('save', lang), type: 'success' });
      triggerHaptic('success');
  };

  if (gameState.status === GameStatus.HOME) {
    return (
      <div className="min-h-screen p-6 flex flex-col items-center relative">
        <Toast toast={toast} />
        {/* Lang Switch */}
        <div className="absolute top-4 right-4 flex gap-2 text-sm font-bold z-10">
            <button onClick={() => setLang('en')} className={lang === 'en' ? 'text-tg-button' : 'text-tg-hint'}>EN</button>
            <span className="text-tg-hint">|</span>
            <button onClick={() => setLang('ru')} className={lang === 'ru' ? 'text-tg-button' : 'text-tg-hint'}>RU</button>
        </div>

        {/* Header */}
        <div className="mt-12 mb-8 text-center space-y-2">
            <h1 className="text-4xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-orange-500">
            AGAINST AI
            </h1>
            <p className="text-tg-hint text-xs max-w-xs mx-auto">{t('mockNote', lang)}</p>
        </div>

        <div className="w-full max-w-sm space-y-8 animate-fade-in">
            {/* Create Lobby Button */}
            <Button onClick={handleCreateLobby} isLoading={loading}>
                {t('createLobby', lang)}
            </Button>

            {/* Divider */}
            <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-tg-hint/20"></div>
                <span className="flex-shrink mx-4 text-tg-hint text-xs uppercase">{t('or', lang)}</span>
                <div className="flex-grow border-t border-tg-hint/20"></div>
            </div>

            {/* Join Lobby Code Input */}
            <div className="space-y-2">
                 <label className="text-xs text-tg-hint uppercase font-bold text-center block tracking-widest">{t('enterCode', lang)}</label>
                 <CodeInput
                    onComplete={(code) => handleJoinLobby(code)}
                    hasError={!!errorMsg}
                    disabled={loading}
                 />
                 {errorMsg && <p className="text-red-500 text-sm text-center font-bold animate-pulse mt-2">{errorMsg}</p>}
            </div>
        </div>
      </div>
    );
  }

  if (gameState.status === GameStatus.LOBBY_WAITING || gameState.status === GameStatus.LOBBY_SETUP || gameState.status === GameStatus.LOBBY_STARTING) {
      return (
          <div className="min-h-screen flex flex-col p-4 relative">
              <Toast toast={toast} />
              {showSettingsModal && (
                  <SettingsModal
                      settingsNick={settingsNick}
                      setSettingsNick={setSettingsNick}
                      settingsApiKey={settingsApiKey}
                      setSettingsApiKey={setSettingsApiKey}
                      settingsNavyApiKey={settingsNavyApiKey}
                      setSettingsNavyApiKey={setSettingsNavyApiKey}
                      saveSettings={saveSettings}
                      setShowSettingsModal={setShowSettingsModal}
                      lang={lang}
                      user={user}
                  />
              )}

              <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold">{t('lobbySetup', lang)}</h2>
                  <div className="flex items-center gap-2">
                       {/* Settings Button */}
                       <button
                         onClick={openSettings}
                         className="p-2 rounded-full bg-tg-secondaryBg border border-tg-hint/20 text-tg-hint hover:text-tg-text transition-colors"
                       >
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                             <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                           </svg>
                       </button>

                       <div className="flex items-center gap-2 bg-tg-secondaryBg px-3 py-1 rounded-lg border border-tg-hint/20">
                          <span className="text-xs text-tg-hint uppercase">{t('codeLabel', lang)}</span>
                          <span className="text-xl font-mono font-bold tracking-widest select-all">{gameState.lobbyCode}</span>
                       </div>
                  </div>
              </div>

              {/* API Key Warning for Captain */}
              {user?.isCaptain && !localStorage.getItem(STORAGE_KEYS.API_KEY) && (
                  <div className="bg-red-500/10 border border-red-500/50 p-3 rounded-xl mb-4 text-center animate-pulse">
                      <p className="text-red-500 text-xs font-bold">{t('missingApiKey', lang)}</p>
                      <p className="text-tg-hint text-[10px]">{t('missingApiKeyDesc', lang)}</p>
                  </div>
              )}

              <div className="bg-tg-secondaryBg p-5 rounded-2xl border border-tg-hint/10 space-y-4 mb-4">
                  <h3 className="text-xs font-bold text-tg-hint uppercase tracking-wider mb-2">{t('gameSettings', lang)}</h3>

                  {/* Scenario Type Selection */}
                  <div
                    className="flex overflow-x-auto space-x-3 pb-2 scrollbar-hide cursor-grab active:cursor-grabbing"
                    ref={scrollContainerRef}
                    onMouseDown={handleMouseDown}
                    onMouseLeave={handleMouseLeave}
                    onMouseUp={handleMouseUp}
                    onMouseMove={handleMouseMove}
                  >
                      {Object.values(ScenarioType).map(type => (
                          <button
                            key={type}
                            onClick={() => handleUpdateSettings('scenarioType', type)}
                            disabled={!user?.isCaptain}
                            className={`flex-shrink-0 px-4 py-2 rounded-xl border transition-all ${gameState.settings.scenarioType === type
                                ? 'bg-tg-button text-white border-transparent shadow-lg scale-105'
                                : 'bg-tg-bg text-tg-hint border-tg-hint/10 hover:bg-tg-bg/80'}`}
                          >
                              {type.replace(/_/g, ' ').toUpperCase()}
                          </button>
                      ))}
                  </div>

                  {/* Mode Selection */}
                  <div className="grid grid-cols-3 gap-2">
                      {Object.values(GameMode).map(mode => (
                          <button
                            key={mode}
                            onClick={() => handleUpdateSettings('mode', mode)}
                            disabled={!user?.isCaptain}
                            className={`py-2 text-xs font-bold uppercase rounded-lg border transition-all ${gameState.settings.mode === mode
                                ? 'bg-tg-button text-white border-transparent'
                                : 'bg-tg-bg text-tg-hint border-tg-hint/10 hover:bg-tg-bg/80'}`}
                          >
                              {mode === GameMode.BATTLE_ROYALE ? 'ROYALE' : mode}
                          </button>
                      ))}
                  </div>

                  {/* Language Selection */}
                  <div>
                      <div className="flex justify-between text-sm mb-2">
                          <span>{t('storyLanguage', lang)}</span>
                      </div>
                      <div className="flex gap-2 p-1 bg-tg-bg rounded-lg">
                          <button
                            onClick={() => handleUpdateSettings('storyLanguage', 'en')}
                            disabled={!user?.isCaptain}
                            className={`flex-1 py-1 text-sm rounded-md transition-colors ${gameState.settings.storyLanguage === 'en' ? 'bg-tg-button text-white' : 'text-tg-hint opacity-70'}`}
                          >
                            English
                          </button>
                          <button
                            onClick={() => handleUpdateSettings('storyLanguage', 'ru')}
                            disabled={!user?.isCaptain}
                            className={`flex-1 py-1 text-sm rounded-md transition-colors ${gameState.settings.storyLanguage === 'ru' ? 'bg-tg-button text-white' : 'text-tg-hint opacity-70'}`}
                          >
                            Русский
                          </button>
                      </div>
                  </div>

                  {/* AI Model Level */}
                  <div>
                      <div className="flex justify-between text-sm mb-2">
                          <span>{t('aiLevel', lang)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                          {(['economy', 'balanced', 'premium'] as AIModelLevel[]).map((level) => (
                             <button
                                key={level}
                                onClick={() => handleUpdateSettings('aiModelLevel', level)}
                                disabled={!user?.isCaptain}
                                className={`py-2 px-1 text-[10px] font-bold uppercase rounded-lg border transition-all flex flex-col items-center justify-center text-center gap-1
                                    ${gameState.settings.aiModelLevel === level
                                        ? 'bg-tg-button text-white border-transparent'
                                        : 'bg-tg-bg text-tg-hint border-tg-hint/10 hover:bg-tg-bg/80'
                                    }
                                    ${!user?.isCaptain ? 'opacity-50 cursor-not-allowed' : ''}
                                `}
                             >
                                 <span>{t(level, lang)}</span>
                                 <span className="text-[8px] opacity-70 normal-case leading-tight max-w-full overflow-hidden text-ellipsis">
                                     {level === 'economy' && t('economyDesc', lang)}
                                     {level === 'balanced' && t('balancedDesc', lang)}
                                     {level === 'premium' && t('premiumDesc', lang)}
                                 </span>
                             </button>
                          ))}
                      </div>
                  </div>

                  {/* Image Generation Mode */}
                  <div>
                      <div className="flex justify-between text-sm mb-2">
                  {/* Voiceover Settings */}
                  <div>
                      <div className="flex justify-between text-sm mb-2">
                          <span>Voiceover (API.NAVY)</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mb-4">
                           {/* Scenario Voiceover */}
                           <button
                              onClick={() => handleUpdateSettings('voiceoverScenario', !gameState.settings.voiceoverScenario)}
                              disabled={!user?.isCaptain}
                              className={`py-2 px-1 text-[10px] font-bold uppercase rounded-lg border transition-all flex flex-col items-center justify-center text-center gap-1
                                  ${gameState.settings.voiceoverScenario
                                      ? 'bg-tg-button text-white border-transparent'
                                      : 'bg-tg-bg text-tg-hint border-tg-hint/10 hover:bg-tg-bg/80'
                                  }
                                  ${!user?.isCaptain ? 'opacity-50 cursor-not-allowed' : ''}
                              `}
                           >
                               <span>{t('voiceoverScenario', lang)}</span>
                               {gameState.settings.voiceoverScenario && <span className="text-[8px] text-yellow-300 font-bold">{t('expensive', lang)}</span>}
                           </button>

                           {/* Results Voiceover */}
                           <button
                              onClick={() => handleUpdateSettings('voiceoverResults', !gameState.settings.voiceoverResults)}
                              disabled={!user?.isCaptain}
                              className={`py-2 px-1 text-[10px] font-bold uppercase rounded-lg border transition-all flex flex-col items-center justify-center text-center gap-1
                                  ${gameState.settings.voiceoverResults
                                      ? 'bg-tg-button text-white border-transparent'
                                      : 'bg-tg-bg text-tg-hint border-tg-hint/10 hover:bg-tg-bg/80'
                                  }
                                  ${!user?.isCaptain ? 'opacity-50 cursor-not-allowed' : ''}
                              `}
                           >
                               <span>{t('voiceoverResults', lang)}</span>
                               {gameState.settings.voiceoverResults && <span className="text-[8px] text-yellow-300 font-bold">{t('expensive', lang)}</span>}
                           </button>
                      </div>
                  </div>

                          <span>{t('imageGenerationMode', lang)}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                          {(['none', 'scenario', 'full'] as ImageGenerationMode[]).map((mode) => (
                             <button
                                key={mode}
                                onClick={() => handleUpdateSettings('imageGenerationMode', mode)}
                                disabled={!user?.isCaptain}
                                className={`py-2 px-1 text-[10px] font-bold uppercase rounded-lg border transition-all flex flex-col items-center justify-center text-center gap-1
                                    ${gameState.settings.imageGenerationMode === mode
                                        ? 'bg-tg-button text-white border-transparent'
                                        : 'bg-tg-bg text-tg-hint border-tg-hint/10 hover:bg-tg-bg/80'
                                    }
                                    ${!user?.isCaptain ? 'opacity-50 cursor-not-allowed' : ''}
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

              <h3 className="text-xs font-bold text-tg-hint uppercase tracking-wider mb-2">{t('players', lang)}</h3>
              <div className="flex-grow space-y-2 overflow-y-auto">
                  {gameState.players.map(p => (
                      <div key={p.id} className={`flex items-center p-3 bg-tg-secondaryBg rounded-lg ${!p.isOnline ? 'opacity-50' : ''}`}>
                          <div className={`w-3 h-3 rounded-full mr-3 ${p.status === 'ready' ? 'bg-green-500' : 'bg-gray-500'}`} />
                          <span className="font-medium">{p.name}</span>
                          {/* API Key Indicators - explicit comparison */}
                          <div className="ml-2 flex gap-1">
                              {p.keyCount >= 1 ? <span className="text-green-500 text-xs">✓</span> : null}
                              {p.keyCount >= 2 ? <span className="text-green-500 text-xs">✓</span> : null}
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
