

export type Language = 'en' | 'ru';

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
  CYBERPUNK = 'cyberpunk'
}

export enum GameStatus {
  HOME = 'HOME',
  LOBBY_SETUP = 'LOBBY_SETUP',
  LOBBY_WAITING = 'LOBBY_WAITING',
  SCENARIO_GENERATION = 'SCENARIO_GENERATION',
  PLAYER_INPUT = 'PLAYER_INPUT',
  JUDGING = 'JUDGING',
  RESULTS = 'RESULTS'
}

export interface Player {
  id: string;
  name: string;
  isCaptain: boolean;
  avatarUrl?: string;
  status: 'alive' | 'dead' | 'waiting' | 'ready';
  actionText?: string;
  isOnline: boolean;
}

export type AIModelLevel = 'economy' | 'balanced' | 'premium';

export interface LobbySettings {
  timeLimitSeconds: number; // 30 - 600
  charLimit: number; // 100 - 3000
  mode: GameMode;
  scenarioType: ScenarioType;
  apiKey: string; // Stored in session, not DB
  storyLanguage: Language | null; // The language the AI generates the story in. Null = not selected.
  aiModelLevel: AIModelLevel;
}

export interface GameState {
  lobbyCode: string | null;
  players: Player[];
  status: GameStatus;
  settings: LobbySettings;
  scenario: string | null;
  scenarioImage?: string; // Optional generated image
  roundResult?: RoundResult;
}

export interface RoundResult {
  story: string;
  survivors: string[]; // IDs of survivors
  deaths: { playerId: string; reason: string }[];
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
}

declare global {
  interface Window {
    Telegram: {
      WebApp: TelegramWebApp;
    };
  }
}