"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MOCK_BOT_JOIN_DELAY_MS = exports.MOCK_BOT_DELAY_MS = exports.MAX_CHARS = exports.MIN_CHARS = exports.MAX_TIME = exports.MIN_TIME = exports.DEFAULT_SETTINGS = void 0;
const types_1 = require("./types");
exports.DEFAULT_SETTINGS = {
    timeLimitSeconds: 120,
    charLimit: 500,
    mode: types_1.GameMode.COOP,
    scenarioType: types_1.ScenarioType.ANY,
    apiKey: '',
    storyLanguage: 'en',
};
exports.MIN_TIME = 30;
exports.MAX_TIME = 600;
exports.MIN_CHARS = 100;
exports.MAX_CHARS = 3000;
exports.MOCK_BOT_DELAY_MS = 3000; // Time for mock bot to "type"
exports.MOCK_BOT_JOIN_DELAY_MS = 2000; // Time for mock bot to join lobby
//# sourceMappingURL=constants.js.map