import { GoogleGenAI, Type, Modality } from "@google/genai";
import { CONFIG } from "../config";
import { SYSTEM_INSTRUCTIONS } from "../prompts";
import { GameMode, ScenarioType, Player, RoundResult, Language, AIModelLevel, ScenarioResponse } from "../../types";
import { ABSTRACT_ROLES } from "../archetypes/roles";
import { ABSTRACT_INCIDENTS } from "../archetypes/incidents";
import { ABSTRACT_TWISTS } from "../archetypes/twists";

// We rely on the global fetch patch (initialized in server/index.ts) to handle proxying
const getClient = (apiKey: string) => new GoogleGenAI({ apiKey: apiKey.trim() });

// Helper to pick model based on level
const getModelName = (level: AIModelLevel = 'balanced', type: 'FAST' | 'SMART'): string => {
    const configLevel = CONFIG.AI_LEVELS[level] || CONFIG.AI_LEVELS.balanced;
    return configLevel[type];
};

// Retry helper for 503/429 errors
const retryWithBackoff = async <T>(
    operation: () => Promise<T>,
    retries: number = 3,
    delay: number = 1000
): Promise<T> => {
    try {
        return await operation();
    } catch (error: any) {
        // Check for 503 (Service Unavailable) or 429 (Too Many Requests)
        const status = error.status || error.response?.status || error.code;
        const isTransient =
            status === 503 ||
            status === 429 ||
            status === 'UNAVAILABLE' ||
            (error.message && error.message.includes('overloaded'));

        if (retries > 0 && isTransient) {
            console.warn(`[Gemini Retry] Error ${status}. Retrying in ${delay}ms... (${retries} attempts left)`);
            await new Promise(resolve => setTimeout(resolve, delay));
            return retryWithBackoff(operation, retries - 1, delay * 2);
        }
        throw error;
    }
};

export const GeminiService = {
  /**
   * Validates if the API Key is working by making a lightweight call.
   */
  validateKey: async (apiKey: string): Promise<boolean> => {
    if (!apiKey || apiKey.length < 10) return false;

    try {
        const ai = getClient(apiKey);
        const modelName = getModelName('economy', 'FAST');

        const response = await retryWithBackoff(() => ai.models.generateContent({
            model: modelName,
            contents: "Ping",
            config: {
                responseMimeType: "text/plain"
            }
        }), 1, 1000);

        return !!response.text;
    } catch (e: any) {
        console.error(`API Key Validation Failed for model ${CONFIG.MODELS.FAST}:`, e.message || e);
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
    players: Player[],
    language: Language = 'en',
    aiLevel: AIModelLevel = 'balanced'
  ): Promise<ScenarioResponse> => {
    if (!apiKey) throw new Error("API Key required");

    const ai = getClient(apiKey);
    const modelName = getModelName(aiLevel, 'SMART');

    // Randomizer Logic
    const role = ABSTRACT_ROLES[Math.floor(Math.random() * ABSTRACT_ROLES.length)];
    const incident = ABSTRACT_INCIDENTS[Math.floor(Math.random() * ABSTRACT_INCIDENTS.length)];
    const useTwist = Math.random() > 0.8; // 20% chance
    const twist = useTwist ? ABSTRACT_TWISTS[Math.floor(Math.random() * ABSTRACT_TWISTS.length)] : "NONE";

    // Prepare variables
    const playerCount = players.length;
    const playersList = players.map(p => p.name).join(", ");

    const scenarioTypes = SYSTEM_INSTRUCTIONS.SCENARIO_TYPES as Record<string, string>;
    let typeInstruction = scenarioTypes[type];

    if (type === ScenarioType.ANY) {
        const keys = Object.keys(scenarioTypes);
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        typeInstruction = scenarioTypes[randomKey];
    }

    const prompt = SYSTEM_INSTRUCTIONS.SCENARIO_GENERATOR
        .replace('{{PLAYER_COUNT}}', playerCount.toString())
        .replace('{{PLAYERS}}', playersList)
        .replace('{{LANGUAGE}}', language === 'ru' ? 'Russian' : 'English')
        .replace('{{THEME}}', typeInstruction)
        .replace('{{ROLE}}', role)
        .replace('{{INCIDENT}}', incident)
        .replace('{{TWIST}}', twist);

    try {
      console.log(`[Gemini Request] Model: ${modelName}, Task: SCENARIO_GENERATOR`);
      console.log(`[Gemini Request] Prompt Preview: ${prompt.substring(0, 200)}...`);

      const response = await retryWithBackoff(() => ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    gm_notes: {
                        type: Type.OBJECT,
                        properties: {
                            analysis: { type: Type.STRING },
                            hidden_threat_logic: { type: Type.STRING },
                            solution_clues: { type: Type.STRING },
                            sanity_check: { type: Type.STRING }
                        }
                    },
                    scenario_text: { type: Type.STRING }
                },
                required: ["scenario_text", "gm_notes"]
            }
        }
      }));

      const text = response.text;
      if (!text) throw new Error("Empty response from AI");

      console.log(`[Gemini Response] Output: ${text.substring(0, 200)}...`);

      try {
          const jsonResponse = JSON.parse(text) as ScenarioResponse;
          return jsonResponse;
      } catch (parseError) {
          console.warn("Gemini returned non-JSON text, falling back to raw text wrap.");
          return {
              scenario_text: text,
              gm_notes: {
                  analysis: "Failed to parse JSON",
                  hidden_threat_logic: "Unknown",
                  solution_clues: "Unknown",
                  sanity_check: "Unknown"
              }
          };
      }

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
    const modelName = getModelName('balanced', 'FAST');

    try {
      console.log(`[Gemini Request] Model: ${modelName}, Task: CHEAT_DETECTOR`);
      console.log(`[Gemini Request] Action: "${actionText}"`);

      const response = await retryWithBackoff(() => ai.models.generateContent({
        model: modelName,
        contents: `
          ${SYSTEM_INSTRUCTIONS.CHEAT_DETECTOR}
          Player Action: "${actionText}"
        `,
        config: {
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
      }));

      const text = response.text;
      console.log(`[Gemini Response] Output: ${text}`);

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
    scenario: ScenarioResponse,
    players: Player[],
    mode: GameMode,
    language: Language = 'en',
    aiLevel: AIModelLevel = 'balanced'
  ): Promise<RoundResult> => {
    if (!apiKey) throw new Error("API Key required");

    const ai = getClient(apiKey);
    const modelName = getModelName(aiLevel, 'SMART');

    const langInstruction = language === 'ru' ? "Write the story in RUSSIAN." : "Write the story in ENGLISH.";

    const gameModes = SYSTEM_INSTRUCTIONS.GAME_MODES as Record<string, string>;
    const modeInstruction = gameModes[mode];

    const inputs = players.map(p => ({
      id: p.id,
      name: p.name,
      action: p.actionText || "No action taken."
    }));

    // Replace placeholders in JUDGE_BASE
    let prompt = SYSTEM_INSTRUCTIONS.JUDGE_BASE
        .replace('{{SCENARIO_TEXT}}', JSON.stringify(scenario, null, 2))
        .replace('{{PLAYER_ACTIONS_JSON}}', JSON.stringify(inputs, null, 2))
        .replace('{{GAME_MODE}}', modeInstruction);

    // Prepend language instruction
    prompt = `
      CONTEXT:
      ${langInstruction}

      ${prompt}
    `;

    try {
      console.log(`[Gemini Request] Model: ${modelName}, Task: JUDGE_BASE`);
      console.log(`[Gemini Request] Scenario Preview: ${scenario.scenario_text.substring(0, 50)}...`);
      console.log(`[Gemini Request] Players Count: ${players.length}`);

      const response = await retryWithBackoff(() => ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
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
      }));

      const text = response.text;
      console.log(`[Gemini Response] Output: ${text}`);

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
  },

  /**
   * Generates an image for the scenario or result.
   */
  generateImage: async (apiKey: string, promptText: string): Promise<string | null> => {
    if (!apiKey) return null;
    const ai = getClient(apiKey);
    const modelName = 'gemini-2.5-flash-image';

    try {
      console.log(`[Gemini Request] Image Gen Model: ${modelName}`);
      console.log(`[Gemini Request] Prompt: ${promptText}`);

      const response = await retryWithBackoff(() => ai.models.generateContent({
        model: modelName,
        contents: [
            {
                role: 'user',
                parts: [{ text: promptText }]
            }
        ],
        config: {
          responseModalities: [Modality.IMAGE],
        }
      }));

      // Extract image from response
      const candidate = response.candidates?.[0];
      if (candidate?.content?.parts?.length) {
          for (const part of candidate.content.parts) {
              if (part.inlineData && part.inlineData.data) {
                  return part.inlineData.data; // Base64 string
              }
          }
      }

      console.warn("Gemini Image Gen: No image data found in response.");
      return null;
    } catch (e: any) {
      console.error("Gemini Image Gen Error:", e);
      return null;
    }
  }
};
