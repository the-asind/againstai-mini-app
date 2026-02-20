import { GoogleGenAI, Type, Modality } from "@google/genai";
import { CONFIG } from "../config";
import { SYSTEM_INSTRUCTIONS } from "../prompts";
import { GameMode, ScenarioType, Player, RoundResult, Language, AIModelLevel, ScenarioResponse } from "../../types";
import { ABSTRACT_ROLES } from "../archetypes/roles";
import { ABSTRACT_INCIDENTS } from "../archetypes/incidents";
import { ABSTRACT_TWISTS } from "../archetypes/twists";
import { KeyManager } from "../utils/keyManager";
import { isTransientError } from "../utils/errorUtils";

// We rely on the global fetch patch (initialized in server/index.ts) to handle proxying
const getClient = (apiKey: string) => new GoogleGenAI({ apiKey: apiKey.trim() });

// Helper to pick model based on level
const getModelName = (level: AIModelLevel = 'balanced', type: 'FAST' | 'SMART'): string => {
    const configLevel = CONFIG.AI_LEVELS[level] || CONFIG.AI_LEVELS.balanced;
    return configLevel[type];
};

// Retry helper for single-key validation (simple backoff)
const retryWithBackoffSingle = async <T>(
    operation: () => Promise<T>,
    retries: number = 2,
    delay: number = 1000
): Promise<T> => {
    try {
        return await operation();
    } catch (error: unknown) {
        if (retries > 0 && isTransientError(error)) {
            await new Promise(resolve => setTimeout(resolve, delay));
            return retryWithBackoffSingle(operation, retries - 1, delay * 2);
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

        const response = await retryWithBackoffSingle(() => ai.models.generateContent({
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
    keyManager: KeyManager,
    mode: GameMode,
    type: ScenarioType,
    players: Player[],
    language: Language = 'en',
    aiLevel: AIModelLevel = 'balanced'
  ): Promise<ScenarioResponse> => {

    return keyManager.executeWithRetry(async (apiKey) => {
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

        console.log(`[Gemini Request] Model: ${modelName}, Task: SCENARIO_GENERATOR`);

        const response = await ai.models.generateContent({
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
        });

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
    });
  },

  /**
   * Checks for player cheating/injection.
   */
  checkInjection: async (keyManager: KeyManager, actionText: string): Promise<{ isCheat: boolean; reason?: string }> => {
    try {
        return await keyManager.executeWithRetry(async (apiKey) => {
            const ai = getClient(apiKey);
            const modelName = getModelName('balanced', 'FAST');

            console.log(`[Gemini Request] Model: ${modelName}, Task: CHEAT_DETECTOR`);

            const response = await ai.models.generateContent({
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
            });

            const text = response.text;
            if (!text) return { isCheat: false };
            return JSON.parse(text);
        });
    } catch (error) {
      console.error("Gemini Injection Check Error:", error);
      return { isCheat: false };
    }
  },

  /**
   * Judges the round outcome.
   */
  judgeRound: async (
    keyManager: KeyManager,
    scenario: ScenarioResponse,
    players: Player[],
    mode: GameMode,
    language: Language = 'en',
    aiLevel: AIModelLevel = 'balanced'
  ): Promise<RoundResult> => {

    // Fallback Result in case all retries fail
    const fallbackResult: RoundResult = {
        story: language === 'ru'
            ? "Связь с ИИ потеряна. Система экстренно завершает симуляцию."
            : "Connection to AI lost. The system is aborting the simulation.",
        survivors: players.map(p => p.id),
        deaths: []
    };

    try {
        return await keyManager.executeWithRetry(async (apiKey) => {
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

            console.log(`[Gemini Request] Model: ${modelName}, Task: JUDGE_BASE`);

            const response = await ai.models.generateContent({
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
            });

            const text = response.text;
            if (!text) throw new Error("Empty response from AI");

            return JSON.parse(text) as RoundResult;
        });
    } catch (error) {
      console.error("Gemini Judge Error (All retries failed):", error);
      return fallbackResult;
    }
  },

  /**
   * Generates an image for the scenario or result.
   */
  generateImage: async (keyManager: KeyManager, promptText: string): Promise<string | null> => {
    try {
        return await keyManager.executeWithRetry(async (apiKey) => {
            const ai = getClient(apiKey);
            const modelName = CONFIG.MODELS.IMAGE;

            console.log(`[Gemini Request] Image Gen Model: ${modelName}`);

            const response = await ai.models.generateContent({
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
            });

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
        });
    } catch (e: any) {
      console.error("Gemini Image Gen Error:", e);
      return null;
    }
  }
};
