
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { CONFIG } from "../config";
import { SYSTEM_INSTRUCTIONS } from "../prompts";
import { GameMode, ScenarioType, Player, RoundResult, Language } from "../../types";

const getClient = (apiKey: string) => new GoogleGenerativeAI(apiKey.trim());

export const GeminiService = {
  /**
   * Validates if the API Key is working by making a lightweight call.
   */
  validateKey: async (apiKey: string): Promise<boolean> => {
    if (!apiKey || apiKey.length < 10) return false;

    try {
        const genAI = getClient(apiKey);
        const modelName = CONFIG.MODELS.FAST;
        const model = genAI.getGenerativeModel({ model: modelName });

        // Minimal token count request
        const result = await model.generateContent({
             contents: [{ role: 'user', parts: [{ text: "Ping" }] }],
             // generationConfig: { maxOutputTokens: 1 } // Removed to avoid potential config issues with some models
        });

        const response = await result.response;
        return !!response.text();
    } catch (e: any) {
        console.error(`API Key Validation Failed for model ${CONFIG.MODELS.FAST}:`, e.message || e);
        if (e.response) {
            console.error("Error Response:", JSON.stringify(e.response, null, 2));
        }
        return false;
    }
  },

  /**
   * Generates a survival scenario.
   */
  generateScenario: async (
    apiKey: string,
    mode: GameMode,
    type: ScenarioType,
    language: Language = 'en'
  ): Promise<string> => {
    if (!apiKey) throw new Error("API Key required");

    const genAI = getClient(apiKey);
    const modelName = CONFIG.MODELS.SMART;
    const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTIONS.SCENARIO_GENERATOR
    });

    const langInstruction = language === 'ru' ? "Output Language: RUSSIAN" : "Output Language: ENGLISH";

    // Pick specific instruction or random
    const scenarioTypes = SYSTEM_INSTRUCTIONS.SCENARIO_TYPES as Record<string, string>;
    let typeInstruction = scenarioTypes[type];

    if (type === ScenarioType.ANY) {
        const keys = Object.keys(scenarioTypes);
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        typeInstruction = scenarioTypes[randomKey];
    }

    const prompt = `
      SETTINGS:
      Game Mode: ${mode}
      Theme: ${typeInstruction}

      ${langInstruction}
    `;

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text() || "Error: No scenario generated.";
    } catch (error) {
      console.error("Gemini Generate Scenario Error:", error);
      throw error;
    }
  },

  /**
   * Checks for player cheating/injection.
   */
  checkInjection: async (apiKey: string, actionText: string): Promise<{ isCheat: boolean; reason?: string }> => {
    if (!apiKey) return { isCheat: false };

    const genAI = getClient(apiKey);
    const modelName = CONFIG.MODELS.FAST;
    const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTIONS.CHEAT_DETECTOR,
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: SchemaType.OBJECT,
                properties: {
                  isCheat: { type: SchemaType.BOOLEAN },
                  reason: { type: SchemaType.STRING, nullable: true },
                },
                required: ["isCheat"]
            }
        }
    });

    try {
      const result = await model.generateContent(`Player Action: "${actionText}"`);
      const response = await result.response;
      const text = response.text();

      if (!text) return { isCheat: false };
      return JSON.parse(text);
    } catch (error) {
      console.error("Gemini Injection Check Error:", error);
      return { isCheat: false };
    }
  },

  /**
   * Judges the round outcome.
   */
  judgeRound: async (
    apiKey: string,
    scenario: string,
    players: Player[],
    mode: GameMode,
    language: Language = 'en'
  ): Promise<RoundResult> => {
    if (!apiKey) throw new Error("API Key required");

    const genAI = getClient(apiKey);
    const modelName = CONFIG.MODELS.SMART;

    const langInstruction = language === 'ru' ? "Write the story in RUSSIAN." : "Write the story in ENGLISH.";

    const gameModes = SYSTEM_INSTRUCTIONS.GAME_MODES as Record<string, string>;
    const modeInstruction = gameModes[mode];

    const inputs = players.map(p => ({
      id: p.id,
      name: p.name,
      action: p.actionText || "No action taken."
    }));

    const prompt = `
      CONTEXT:
      ${langInstruction}
      Scenario: ${scenario}
      Game Mode: ${modeInstruction}

      PLAYER ACTIONS:
      ${JSON.stringify(inputs, null, 2)}
    `;

    const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTIONS.JUDGE_BASE,
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: SchemaType.OBJECT,
                properties: {
                    story: { type: SchemaType.STRING },
                    survivors: {
                        type: SchemaType.ARRAY,
                        items: { type: SchemaType.STRING }
                    },
                    deaths: {
                        type: SchemaType.ARRAY,
                        items: {
                            type: SchemaType.OBJECT,
                            properties: {
                                playerId: { type: SchemaType.STRING },
                                reason: { type: SchemaType.STRING }
                            }
                        }
                    }
                },
                required: ["story", "survivors", "deaths"]
            }
        }
    });

    try {
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();

      if (!text) throw new Error("Empty response from AI");

      return JSON.parse(text) as RoundResult;
    } catch (error) {
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
