
import { GameMode, LobbySettings, ScenarioType } from "./types";

export const DEFAULT_SETTINGS: LobbySettings = {
  timeLimitSeconds: 120,
  charLimit: 500,
  mode: GameMode.COOP,
  scenarioType: ScenarioType.ANY,
  apiKey: '',
  storyLanguage: 'en',
};

export const MIN_TIME = 30;
export const MAX_TIME = 600;
export const MIN_CHARS = 100;
export const MAX_CHARS = 3000;

export const MOCK_BOT_DELAY_MS = 3000; // Time for mock bot to "type"
export const MOCK_BOT_JOIN_DELAY_MS = 2000; // Time for mock bot to join lobby