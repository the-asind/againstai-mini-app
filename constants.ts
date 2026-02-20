export const DEFAULT_SETTINGS = {
    timeLimitSeconds: 120,
    charLimit: 500,
    mode: 'coop',
    scenarioType: 'any',
    storyLanguage: 'en',
    aiModelLevel: 'balanced',
    imageGenerationMode: 'none'
};

export const MIN_TIME = 30;
export const MAX_TIME = 600;
export const MIN_CHARS = 100;
export const MAX_CHARS = 3000;

export const STORAGE_KEYS = {
    API_KEY: 'against_ai_api_key',
    NAVY_KEY: 'against_ai_navy_key',
    NICKNAME: 'against_ai_nickname',
    SETTINGS: 'against_ai_lobby_settings',
    LANG: 'against_ai_ui_lang'
};
