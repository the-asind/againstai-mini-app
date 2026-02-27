export type Language = 'en' | 'ru';

export type LoadingPhase = 'WHEEL' | 'SHOW_RESULT' | 'VOTING' | 'VOTING_RESULTS';
export type RoundType = 'NORMAL' | 'SPECIAL' | 'BOSS_FIGHT';

export interface WheelConfig {
  segments: {
    type: RoundType;
    label: string;
    color: string;
    probability: number;
  }[];
  targetIndex: number;
}

export interface VotingConfig {
  question: string;
  candidates: Omit<Player, 'status' | 'actionText'>[];
  myVoteId: string | null;
  timeLeft: number;
}

export interface VotingResults {
  winnerId: string;
  votesDistribution: Record<string, number>;
}

export enum GameMode {
  COOP = 'coop',
  PVP = 'pvp',
  BATTLE_ROYALE = 'battle_royale'
}

export enum ScenarioType {
  ANY = 'any',
  SCI_FI = 'sci_fi',
  SUPERNATURAL = 'supernatural',
  APOCALYPSE = 'apocalypse',
  FANTASY = 'fantasy',
  CYBERPUNK = 'cyberpunk',
  BACKROOMS = 'backrooms',
  SCP = 'scp',
  MINECRAFT = 'minecraft',
  HARRY_POTTER = 'harry_potter'
}

export enum GameStatus {
  HOME = 'HOME',
  LOBBY_SETUP = 'LOBBY_SETUP',
  LOBBY_WAITING = 'LOBBY_WAITING',
  LOBBY_STARTING = 'LOBBY_STARTING', // Added atomic start state
  SCENARIO_GENERATION = 'SCENARIO_GENERATION',
  PLAYER_INPUT = 'PLAYER_INPUT',
  JUDGING = 'JUDGING',
  RESULTS = 'RESULTS'
}

export enum ImageGenerationMode {
  NONE = 'none',
  SCENARIO = 'scenario',
  FULL = 'full'
}

export interface Player {
  id: string;
  name: string;
  isCaptain: boolean;
  avatarUrl?: string;
  status: 'alive' | 'dead' | 'waiting' | 'ready';
  actionText?: string;
  isOnline: boolean;
  keyCount: 0 | 1 | 2; // Stricter type: 0, 1, or 2
  navyUsage?: { tokens: number; plan?: string };
}

export enum AIModelLevel {
  ECONOMY = 'economy',
  BALANCED = 'balanced',
  PREMIUM = 'premium'
}

export interface LobbySettings {
  timeLimitSeconds: number; // 30 - 600
  charLimit: number; // 100 - 3000
  mode: GameMode;
  scenarioType: ScenarioType;
  // apiKey removed from shared settings for security
  storyLanguage: Language | null; // The language the AI generates the story in. Null = not selected.
  aiModelLevel: AIModelLevel;
  imageGenerationMode: ImageGenerationMode;
  voiceoverScenario: boolean;
  voiceoverResults: boolean;
}

// Internal Server State (Has secrets)
export interface ServerGameState {
  lobbyCode: string | null;
  players: Player[];
  status: GameStatus;
  settings: LobbySettings;
  scenario: ScenarioResponse | null; // Full object with secrets
  scenarioImage?: string;
  scenarioAudio?: string;
  roundResult?: RoundResult;
  geminiKeys: string[];
  navyKeys: string[];
  resultsRevealed: boolean;
}

// Client-Side State (Safe)
export interface GameState {
  lobbyCode: string | null;
  players: Player[];
  status: GameStatus;
  settings: LobbySettings;
  scenario: string | null; // Just the text!
  scenarioImage?: string;
  scenarioAudio?: string;
  roundResult?: RoundResult;
  resultsRevealed: boolean;
}

export interface RoundResult {
  story: string;
  survivors: string[]; // IDs of survivors
  deaths: { playerId: string; reason: string }[];
  image?: string; // Optional generated image for results
  audio?: string; // Optional generated audio for results
}

// Telegram WebApp Types (Partial)
export interface TelegramWebApp {
  initData: string;
  initDataUnsafe: {
    user?: {
      id: number;
      first_name: string;
      last_name?: string;
      username?: string;
      language_code?: string;
    };
    start_param?: string;
  };
  isVersionAtLeast: (version: string) => boolean;
  ready: () => void;
  expand: () => void;
  close: () => void;
  openTelegramLink: (url: string) => void;
  MainButton: {
    text: string;
    color: string;
    textColor: string;
    isVisible: boolean;
    isActive: boolean;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
    showProgress: (leaveActive: boolean) => void;
    hideProgress: () => void;
  };
  HapticFeedback: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
    notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
  };
  themeParams?: Record<string, string>;
}

declare global {
  interface Window {
    Telegram: {
      WebApp: TelegramWebApp;
    };
  }
}

export interface ScenarioResponse {
  gm_notes: {
    analysis: string;
    hidden_threat_logic: string;
    solution_clues: string;
    sanity_check: string;
  };
  scenario_text: string;
}

export interface NavyUsageResponse {
  plan: string;
  limits: {
    tokens_per_day: number;
    rpm: number;
  };
  usage: {
    tokens_used_today: number;
    tokens_remaining_today: number;
    percent_used: number;
    resets_at_utc: string;
    resets_in_ms: number;
  };
  rate_limits: {
    per_minute: {
      limit: number;
      used: number;
      remaining: number;
      resets_in_ms: number;
    };
  };
  server_time_utc: string;
}
