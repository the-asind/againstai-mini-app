
import { GoogleGenAI, Type } from "@google/genai";
import { CONFIG } from "../config";
import { SYSTEM_INSTRUCTIONS } from "../prompts";
import { GameMode, ScenarioType, Player, RoundResult, Language } from "../../types";

const getClient = (apiKey: string) => new GoogleGenAI({ apiKey: apiKey.trim() });

export const GeminiService = {
  /**
   * Validates if the API Key is working by making a lightweight call.
   */
  validateKey: async (apiKey: string): Promise<boolean> => {
    if (!apiKey || apiKey.length < 10) return false;

    try {
        const ai = getClient(apiKey);
        const modelName = CONFIG.MODELS.FAST;

        // Minimal token count request
        await ai.models.generateContent({
            model: modelName,
            contents: "Ping",
            config: {
                maxOutputTokens: 1
            }
        });
        return true;
    } catch (e) {
        console.error("API Key Validation Failed:", e);
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

    const ai = getClient(apiKey);
    const modelName = CONFIG.MODELS.SMART;

    const langInstruction = language === 'ru' ? "Output Language: RUSSIAN" : "Output Language: ENGLISH";

    // Pick specific instruction or random
    // Cast to any to avoid indexing errors if types don't perfectly align in TS inference
    const scenarioTypes = SYSTEM_INSTRUCTIONS.SCENARIO_TYPES as Record<string, string>;
    let typeInstruction = scenarioTypes[type];

    if (type === ScenarioType.ANY) {
        const keys = Object.keys(scenarioTypes);
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        typeInstruction = scenarioTypes[randomKey];
    }

    const prompt = `
      ${SYSTEM_INSTRUCTIONS.SCENARIO_GENERATOR}

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

    const ai = getClient(apiKey);
    const modelName = CONFIG.MODELS.FAST;

    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: `Player Action: "${actionText}"`,
        config: {
          systemInstruction: SYSTEM_INSTRUCTIONS.CHEAT_DETECTOR,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isCheat: { type: Type.BOOLEAN },
              reason: { type: Type.STRING, nullable: true },
            },
            required: ["isCheat"]
          }
        }
      });

      const text = response.text;
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

    const ai = getClient(apiKey);
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
      ${SYSTEM_INSTRUCTIONS.JUDGE_BASE}

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
          systemInstruction: SYSTEM_INSTRUCTIONS.JUDGE_BASE,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              story: { type: Type.STRING },
              survivors: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              deaths: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    playerId: { type: Type.STRING },
                    reason: { type: Type.STRING }
                  }
                }
              }
            },
            required: ["story", "survivors", "deaths"]
          }
        }
      });

      const text = response.text;
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
