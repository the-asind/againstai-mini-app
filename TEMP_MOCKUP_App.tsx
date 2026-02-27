import React, { useState, useRef, useEffect } from 'react';
import { Terminal, Users, Cpu, Fingerprint, Crosshair, Share2, Play, AlertTriangle, Eye, Volume2, Globe, Check, Crown, ChevronDown, Settings, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { InteractiveLoadingScreen } from './components/InteractiveLoadingScreen';
import { LoadingPhase, WheelConfig, VotingConfig, VotingResults, Player } from './types';

export default function App() {
    const [activeGenre, setActiveGenre] = useState('any');
    const [activeMode, setActiveMode] = useState('COOP');
    const [language, setLanguage] = useState('RU');
    const [aiLevel, setAiLevel] = useState('BALANCE');
    const [voiceOptions, setVoiceOptions] = useState<string[]>(['SCENARIO']);
    const [imageGen, setImageGen] = useState('FULL');
    const [isGenreDropdownOpen, setIsGenreDropdownOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // Settings state
    const [nickname, setNickname] = useState('Asind');
    const [geminiKey, setGeminiKey] = useState('********************************');
    const [navyKey, setNavyKey] = useState('********************************');
    const [interfaceLang, setInterfaceLang] = useState('RU');

    // Loading Screen State
    const [isGenerating, setIsGenerating] = useState(false);
    const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('WHEEL');
    const [myVote, setMyVote] = useState<string | null>(null);
    const [loadingText, setLoadingText] = useState("Генерация нейронных связей монстра...");
    const [timeLeft, setTimeLeft] = useState(15);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

    const genres = [
        { id: 'any', label: '🎲 Случайно' },
        { id: 'scifi', label: 'Науч-Фант / Космос' },
        { id: 'supernatural', label: 'Сверхъестественное' },
        { id: 'apocalypse', label: 'Апокалипсис' },
        { id: 'fantasy', label: 'Темное Фэнтези' },
        { id: 'cyberpunk', label: 'Киберпанк' },
        { id: 'backrooms', label: 'Закулисье' },
        { id: 'scp', label: 'SCP Foundation' },
        { id: 'minecraft', label: 'Minecraft' },
        { id: 'harryPotter', label: 'Гарри Поттер' },
    ];

    const modes = ['COOP', 'PVP', 'ROYALE'];

    const aiLevels = [
        { id: 'ECONOMY', label: 'LITE', desc: 'Fast / Low Cost' },
        { id: 'BALANCE', label: 'CORE', desc: 'Balanced Logic' },
        { id: 'PREMIUM', label: 'PRO', desc: 'Max Intelligence' },
    ];

    const toggleVoice = (opt: string) => {
        setVoiceOptions(prev =>
            prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]
        );
    };

    // Mock players
    const players = [
        { id: 1, name: nickname, isCaptain: true, ready: true, avatar: 'https://picsum.photos/seed/asind/100/100' },
        { id: 2, name: 'PlayerTwo', isCaptain: false, ready: true, avatar: 'https://picsum.photos/seed/p2/100/100' },
        { id: 3, name: 'CyberNinja', isCaptain: false, ready: false, avatar: 'https://picsum.photos/seed/p3/100/100' },
    ];

    const activeGenreLabel = genres.find(g => g.id === activeGenre)?.label;

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

    // --- LOADING SCREEN MOCK DATA & LOGIC ---
    const mockPlayers: Player[] = players.map(p => ({
        id: p.id.toString(),
        name: p.name,
        avatarUrl: p.avatar,
        isCaptain: p.isCaptain,
        isOnline: true,
        status: 'alive',
        keyCount: 1
    }));

    const wheelSegments = Array(20).fill(null).map((_, i) => {
        if (i === 0 || i === 10) return { type: 'BOSS_FIGHT' as const, label: 'БОСС', color: '#ef4444', probability: 0.05 };
        if (i % 4 === 0) return { type: 'SPECIAL' as const, label: 'СПЕШЛ', color: '#eab308', probability: 0.05 };
        return { type: 'NORMAL' as const, label: 'ОБЫЧНЫЙ', color: '#3b82f6', probability: 0.05 };
    });

    const wheelConfig: WheelConfig = {
        targetIndex: 10, // Index 10 is a BOSS_FIGHT
        segments: wheelSegments
    };

    const questions = [
        "Кто из вас скорее всего спрячется за спинами товарищей?",
        "Кто первым попытается погладить инопланетного монстра?",
        "Кого первым съедят каннибалы из-за его характера?",
        "Кто нажмет красную кнопку просто ради интереса?",
        "Кто будет паниковать громче всех?"
    ];

    const votingConfig: VotingConfig = {
        question: questions[currentQuestionIndex],
        candidates: mockPlayers,
        myVoteId: myVote,
        timeLeft: timeLeft
    };

    const votingResults: VotingResults = {
        winnerId: '2',
        votesDistribution: {
            '1': myVote === '1' ? 2 : 1,
            '2': myVote === '2' ? 3 : 2,
            '3': myVote === '3' ? 1 : 0
        }
    };

    // Timer loop for loading screen
    useEffect(() => {
        if (!isGenerating) return;

        let timer: NodeJS.Timeout;

        if (loadingPhase === 'SHOW_RESULT') {
            timer = setTimeout(() => {
                setLoadingPhase('VOTING');
                setLoadingText("ИИ анализирует ваши страхи...");
                setTimeLeft(8);
            }, 5000);
        } else if (loadingPhase === 'VOTING') {
            timer = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        setLoadingPhase('VOTING_RESULTS');
                        setLoadingText("Финализация сценария...");
                        setTimeLeft(5);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else if (loadingPhase === 'VOTING_RESULTS') {
            timer = setInterval(() => {
                setTimeLeft(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        setCurrentQuestionIndex(idx => (idx + 1) % questions.length);
                        setMyVote(null);
                        setLoadingPhase('VOTING');
                        setLoadingText("ИИ анализирует ваши страхи...");
                        setTimeLeft(8);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        }

        return () => {
            if (timer) clearInterval(timer);
            if (timer) clearTimeout(timer);
        };
    }, [isGenerating, loadingPhase]);

    const handleInitiate = () => {
        setIsGenerating(true);
        setLoadingPhase('WHEEL');
        setLoadingText("Анализ вероятностей...");
        setMyVote(null);
        setCurrentQuestionIndex(0);

        // Master timer to stop generation after 45 seconds
        setTimeout(() => {
            setIsGenerating(false);
        }, 45000);
    };

    const handleWheelComplete = () => {
        setLoadingPhase('SHOW_RESULT');
        setLoadingText("Определение следующего этапа...");
    };

    if (isGenerating) {
        return (
            <InteractiveLoadingScreen
                phase={loadingPhase}
                wheelConfig={wheelConfig}
                votingConfig={votingConfig}
                votingResults={votingResults}
                loadingText={loadingText}
                onVote={(id) => setMyVote(id)}
                onWheelSpinComplete={handleWheelComplete}
            />
        );
    }

    return (
        <div className="min-h-screen p-4 pb-32 font-sans selection:bg-game-accent/30 max-w-5xl mx-auto relative z-10">
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
                        <span className="text-game-accent bg-game-accent/10 px-3 py-1.5 rounded-sm border border-game-accent/30 tracking-wider">S98K75</span>
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

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Environment (Genre) - Dropdown */}
                            <div className="relative" ref={dropdownRef}>
                                <div className="text-[10px] font-mono text-tg-hint mb-2 flex items-center gap-1.5">
                                    <Globe size={12} /> ENVIRONMENT
                                </div>
                                <button
                                    onClick={() => setIsGenreDropdownOpen(!isGenreDropdownOpen)}
                                    className="w-full flex items-center justify-between px-4 py-3 bg-black/40 border border-game-accent/30 text-tg-text font-mono text-xs hover:border-game-accent/60 transition-colors rounded-sm"
                                >
                                    <span className="truncate">{activeGenreLabel}</span>
                                    <ChevronDown size={14} className={`text-game-accent transition-transform duration-200 ${isGenreDropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                <AnimatePresence>
                                    {isGenreDropdownOpen && (
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
                                                        setActiveGenre(g.id);
                                                        setIsGenreDropdownOpen(false);
                                                    }}
                                                    className={`w-full text-left px-4 py-3 text-xs font-mono transition-colors ${activeGenre === g.id
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
                                        const isActive = activeMode === m;
                                        return (
                                            <button
                                                key={m}
                                                onClick={() => setActiveMode(m)}
                                                className={`relative h-full text-[10px] md:text-xs font-mono transition-colors ${isActive ? 'text-tg-buttonText font-bold' : 'text-tg-hint hover:text-tg-text'
                                                    }`}
                                            >
                                                {isActive && (
                                                    <motion.div
                                                        layoutId="mode-bg"
                                                        className="absolute inset-0 bg-game-accent/80 border border-game-accent rounded-sm"
                                                        initial={false}
                                                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                                    />
                                                )}
                                                <span className="relative z-10">{m}</span>
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
                                    const isActive = aiLevel === level.id;
                                    return (
                                        <button
                                            key={level.id}
                                            onClick={() => setAiLevel(level.id)}
                                            className={`relative p-3 text-left transition-colors border rounded-sm ${isActive ? 'border-game-accent' : 'border-game-accent/20 bg-black/30 hover:border-game-accent/40'
                                                }`}
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
                                    {['SCENARIO', 'RESULTS'].map(opt => {
                                        const isActive = voiceOptions.includes(opt);
                                        return (
                                            <button
                                                key={opt}
                                                onClick={() => toggleVoice(opt)}
                                                className={`relative w-full text-left px-3 py-2.5 text-[10px] md:text-xs font-mono border rounded-sm transition-colors flex justify-between items-center overflow-hidden ${isActive ? 'border-game-accent text-tg-buttonText' : 'border-game-accent/20 bg-black/30 text-tg-hint hover:border-game-accent/40'
                                                    }`}
                                            >
                                                {isActive && (
                                                    <motion.div
                                                        layoutId={`voice-bg-${opt}`}
                                                        className="absolute inset-0 bg-game-accent"
                                                        initial={false}
                                                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                                    />
                                                )}
                                                <span className="relative z-10">{opt}</span>
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
                                        { id: 'NONE', label: 'OFF' },
                                        { id: 'SCENARIO', label: 'SCENARIO ONLY' },
                                        { id: 'FULL', label: 'FULL RENDER' }
                                    ].map(opt => {
                                        const isActive = imageGen === opt.id;
                                        return (
                                            <button
                                                key={opt.id}
                                                onClick={() => setImageGen(opt.id)}
                                                className={`relative px-3 py-2.5 text-[10px] md:text-xs font-mono border rounded-sm transition-colors text-left overflow-hidden ${isActive ? 'border-game-accent text-tg-buttonText' : 'border-game-accent/20 bg-black/30 text-tg-hint hover:border-game-accent/40'
                                                    }`}
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
                                {['RU', 'EN'].map(lang => (
                                    <button
                                        key={lang}
                                        onClick={() => setLanguage(lang)}
                                        className={`px-4 py-1.5 text-[10px] font-mono rounded-sm transition-colors ${language === lang
                                                ? 'bg-game-accent text-tg-buttonText font-bold'
                                                : 'text-tg-hint hover:text-tg-text'
                                            }`}
                                    >
                                        {lang}
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
                            {players.length} CONNECTED
                        </span>
                    </div>

                    <div className="space-y-3">
                        {players.map((player, idx) => (
                            <motion.div
                                key={player.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: idx * 0.1 }}
                                className={`flex items-center justify-between p-3.5 rounded-sm border ${player.isCaptain ? 'tactical-border bg-game-panel border-game-accent/40 shadow-sm' : 'bg-black/40 border-game-accent/10'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="relative">
                                        <img src={player.avatar} alt={player.name} className={`w-11 h-11 rounded-sm border ${player.ready ? 'border-game-accent' : 'border-tg-hint'} grayscale hover:grayscale-0 transition-all`} referrerPolicy="no-referrer" />
                                        {player.ready && (
                                            <div className="absolute -bottom-1.5 -right-1.5 w-4 h-4 bg-game-accent rounded-sm border border-black flex items-center justify-center shadow-sm">
                                                <Check size={10} className="text-tg-buttonText" />
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <div className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
                                            {player.name}
                                        </div>
                                        <div className={`text-[10px] font-mono mt-0.5 ${player.ready ? 'text-game-accent' : 'text-tg-hint'}`}>
                                            STATUS: {player.ready ? 'READY' : 'CONFIGURING'}
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
                    <motion.button
                        onClick={handleInitiate}
                        whileTap={{ scale: 0.98 }}
                        className="w-full lg:w-auto lg:px-12 py-4 md:py-5 bg-game-accent text-tg-buttonText font-mono font-bold text-sm md:text-base border border-game-accent hover:opacity-90 transition-opacity flex items-center justify-center gap-2 uppercase tracking-widest tactical-border shadow-[0_0_20px_rgba(46,160,94,0.2)]"
                    >
                        <Play fill="currentColor" size={18} />
                        Initiate Protocol
                    </motion.button>
                    <motion.button
                        whileTap={{ scale: 0.95 }}
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
                                    <h2 className="text-lg font-mono font-bold text-white tracking-widest">Настройки</h2>
                                    <button onClick={() => setIsSettingsOpen(false)} className="text-tg-hint hover:text-white transition-colors">
                                        <X size={20} />
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {/* Interface Language Toggle */}
                                    <div className="flex items-center justify-between bg-black/40 border border-game-accent/30 rounded-sm p-2">
                                        <label className="text-[10px] font-mono text-tg-hint uppercase tracking-wider ml-2">Язык интерфейса</label>
                                        <div className="flex bg-black/50 border border-game-accent/30 rounded-sm p-0.5">
                                            {['RU', 'EN'].map(lang => (
                                                <button
                                                    key={lang}
                                                    onClick={() => setInterfaceLang(lang)}
                                                    className={`px-3 py-1 text-[10px] font-mono rounded-sm transition-colors ${interfaceLang === lang
                                                            ? 'bg-game-accent text-tg-buttonText font-bold'
                                                            : 'text-tg-hint hover:text-tg-text'
                                                        }`}
                                                >
                                                    {lang}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-mono text-tg-hint mb-2 uppercase tracking-wider">Ваш никнейм</label>
                                        <input
                                            type="text"
                                            value={nickname}
                                            onChange={(e) => setNickname(e.target.value)}
                                            className="w-full bg-black/40 border border-game-accent/30 rounded-sm px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-game-accent transition-colors"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-mono text-tg-hint mb-2 uppercase tracking-wider">GEMINI API КЛЮЧ (ОБЯЗАТЕЛЬНО)</label>
                                        <input
                                            type="password"
                                            value={geminiKey}
                                            onChange={(e) => setGeminiKey(e.target.value)}
                                            className="w-full bg-black/40 border border-game-accent/30 rounded-sm px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-game-accent transition-colors"
                                        />
                                        <p className="text-[9px] text-tg-hint mt-1.5 font-mono">Получите бесплатно на <a href="#" className="text-game-accent hover:underline">aistudio.google.com/api-keys</a>.</p>
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-mono text-tg-hint mb-2 uppercase tracking-wider">API.NAVY КЛЮЧ (ОПЦИОНАЛЬНО)</label>
                                        <input
                                            type="password"
                                            value={navyKey}
                                            onChange={(e) => setNavyKey(e.target.value)}
                                            className="w-full bg-black/40 border border-game-accent/30 rounded-sm px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-game-accent transition-colors"
                                        />
                                        <p className="text-[9px] text-tg-hint mt-1.5 font-mono">Получить ключ: <a href="#" className="text-game-accent hover:underline">api.navy</a>.</p>
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-4 border-t border-game-accent/20">
                                    <button
                                        onClick={() => setIsSettingsOpen(false)}
                                        className="flex-1 py-3 bg-black/40 border border-game-accent/30 text-tg-hint font-mono text-xs hover:text-white hover:border-game-accent/60 transition-colors rounded-sm"
                                    >
                                        Отмена
                                    </button>
                                    <button
                                        onClick={() => setIsSettingsOpen(false)}
                                        className="flex-1 py-3 bg-game-accent text-tg-buttonText font-mono font-bold text-xs border border-game-accent hover:opacity-90 transition-opacity rounded-sm shadow-[0_0_10px_rgba(46,160,94,0.2)]"
                                    >
                                        Сохранить
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
