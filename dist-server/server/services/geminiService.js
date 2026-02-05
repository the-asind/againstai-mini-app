"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GeminiService = void 0;
const genai_1 = require("@google/genai");
const config_1 = require("../config");
const prompts_1 = require("../prompts");
const types_1 = require("../../types");
const getClient = (apiKey) => new genai_1.GoogleGenAI({ apiKey: apiKey.trim() });
exports.GeminiService = {
    /**
     * Validates if the API Key is working by making a lightweight call.
     */
    validateKey: async (apiKey) => {
        if (!apiKey || apiKey.length < 10)
            return false;
        try {
            const ai = getClient(apiKey);
            const modelName = config_1.CONFIG.MODELS.FAST;
            // Minimal token count request
            await ai.models.generateContent({
                model: modelName,
                contents: "Ping",
                config: {
                    maxOutputTokens: 1
                }
            });
            return true;
        }
        catch (e) {
            console.error("API Key Validation Failed:", e);
            return false;
        }
    },
    /**
     * Generates a survival scenario.
     */
    generateScenario: async (apiKey, mode, type, language = 'en') => {
        if (!apiKey)
            throw new Error("API Key required");
        const ai = getClient(apiKey);
        const modelName = config_1.CONFIG.MODELS.SMART;
        const langInstruction = language === 'ru' ? "Output Language: RUSSIAN" : "Output Language: ENGLISH";
        // Pick specific instruction or random
        // Cast to any to avoid indexing errors if types don't perfectly align in TS inference
        const scenarioTypes = prompts_1.SYSTEM_INSTRUCTIONS.SCENARIO_TYPES;
        let typeInstruction = scenarioTypes[type];
        if (type === types_1.ScenarioType.ANY) {
            const keys = Object.keys(scenarioTypes);
            const randomKey = keys[Math.floor(Math.random() * keys.length)];
            typeInstruction = scenarioTypes[randomKey];
        }
        const prompt = `
      ${prompts_1.SYSTEM_INSTRUCTIONS.SCENARIO_GENERATOR}

      SETTINGS:
      Game Mode: ${mode}
      Theme: ${typeInstruction}

      ${langInstruction}
    `;
        try {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {}
            });
            return response.text || "Error: No scenario generated.";
        }
        catch (error) {
            console.error("Gemini Generate Scenario Error:", error);
            throw error;
        }
    },
    /**
     * Checks for player cheating/injection.
     */
    checkInjection: async (apiKey, actionText) => {
        if (!apiKey)
            return { isCheat: false };
        const ai = getClient(apiKey);
        const modelName = config_1.CONFIG.MODELS.FAST;
        try {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: `Player Action: "${actionText}"`,
                config: {
                    systemInstruction: prompts_1.SYSTEM_INSTRUCTIONS.CHEAT_DETECTOR,
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: genai_1.Type.OBJECT,
                        properties: {
                            isCheat: { type: genai_1.Type.BOOLEAN },
                            reason: { type: genai_1.Type.STRING, nullable: true },
                        },
                        required: ["isCheat"]
                    }
                }
            });
            const text = response.text;
            if (!text)
                return { isCheat: false };
            return JSON.parse(text);
        }
        catch (error) {
            console.error("Gemini Injection Check Error:", error);
            return { isCheat: false };
        }
    },
    /**
     * Judges the round outcome.
     */
    judgeRound: async (apiKey, scenario, players, mode, language = 'en') => {
        if (!apiKey)
            throw new Error("API Key required");
        const ai = getClient(apiKey);
        const modelName = config_1.CONFIG.MODELS.SMART;
        const langInstruction = language === 'ru' ? "Write the story in RUSSIAN." : "Write the story in ENGLISH.";
        const gameModes = prompts_1.SYSTEM_INSTRUCTIONS.GAME_MODES;
        const modeInstruction = gameModes[mode];
        const inputs = players.map(p => ({
            id: p.id,
            name: p.name,
            action: p.actionText || "No action taken."
        }));
        const prompt = `
      ${prompts_1.SYSTEM_INSTRUCTIONS.JUDGE_BASE}

      CONTEXT:
      ${langInstruction}
      Scenario: ${scenario}
      Game Mode: ${modeInstruction}

      PLAYER ACTIONS:
      ${JSON.stringify(inputs, null, 2)}
    `;
        try {
            const response = await ai.models.generateContent({
                model: modelName,
                contents: prompt,
                config: {
                    systemInstruction: prompts_1.SYSTEM_INSTRUCTIONS.JUDGE_BASE,
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: genai_1.Type.OBJECT,
                        properties: {
                            story: { type: genai_1.Type.STRING },
                            survivors: {
                                type: genai_1.Type.ARRAY,
                                items: { type: genai_1.Type.STRING }
                            },
                            deaths: {
                                type: genai_1.Type.ARRAY,
                                items: {
                                    type: genai_1.Type.OBJECT,
                                    properties: {
                                        playerId: { type: genai_1.Type.STRING },
                                        reason: { type: genai_1.Type.STRING }
                                    }
                                }
                            }
                        },
                        required: ["story", "survivors", "deaths"]
                    }
                }
            });
            const text = response.text;
            if (!text)
                throw new Error("Empty response from AI");
            return JSON.parse(text);
        }
        catch (error) {
            console.error("Gemini Judge Error:", error);
            return {
                story: language === 'ru'
                    ? "Связь с ИИ потеряна. Система экстренно завершает симуляцию. Все участники эвакуированы."
                    : "Connection to AI lost. The system is aborting the simulation. All participants evacuated.",
                survivors: players.map(p => p.id),
                deaths: []
            };
        }
    }
};
//# sourceMappingURL=geminiService.js.map