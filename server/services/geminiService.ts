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
const getModelName = (level: AIModelLevel = AIModelLevel.BALANCED, type: 'FAST' | 'SMART'): string => {
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

// Utility to extract JSON from potentially messy AI text
const extractJSON = (text: string): any => {
  try {
    return JSON.parse(text);
  } catch {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (innerErr) {
        // Return null so the caller can fallback
        return null;
      }
    }
    return null;
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
      const modelName = getModelName(AIModelLevel.ECONOMY, 'FAST');

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

  generateScenario: async (
    keyManager: KeyManager,
    mode: GameMode,
    type: ScenarioType,
    players: Player[],
    language: Language = 'en',
    aiLevel: AIModelLevel = AIModelLevel.BALANCED,
    twistType: string = "NONE",
    chosenPlayerId: string | null = null,
    playerStates?: Record<string, import('../../types').PlayerState>,
    previousGmNotes?: import('../../types').ServerGameState["gmNotes"],
    currentRoundType: import('../../types').RoundType = 'NORMAL'
  ): Promise<ScenarioResponse> => {

    return keyManager.executeWithRetry(async (apiKey) => {
      const ai = getClient(apiKey);
      const modelName = getModelName(aiLevel, 'SMART');

      // Randomizer Logic
      const role = ABSTRACT_ROLES[Math.floor(Math.random() * ABSTRACT_ROLES.length)];
      const incident = ABSTRACT_INCIDENTS[Math.floor(Math.random() * ABSTRACT_INCIDENTS.length)];
      // Note: Twist logic (chance and selection) is now expected to be handled by the caller (LobbyService)
      const twist = twistType === "NONE" ? "NONE" : ABSTRACT_TWISTS.find(t => t.includes(twistType)) || twistType;

      // Prepare variables
      const playerCount = players.length;
      const playersJson = JSON.stringify(players.map(p => ({
        id: p.id,
        name: p.name,
        inventory: playerStates?.[p.id]?.inventory || [],
        status_effects: playerStates?.[p.id]?.status_effects || []
      })));
      const playersList = players.map(p => p.name).join(", ");
      const prevGmNotesStr = previousGmNotes ? JSON.stringify(previousGmNotes) : "Нет (Первый раунд)";

      const scenarioTypes = SYSTEM_INSTRUCTIONS.SCENARIO_TYPES as Record<string, string>;
      let typeInstruction = scenarioTypes[type];

      if (type === ScenarioType.ANY) {
        const keys = Object.keys(scenarioTypes);
        const randomKey = keys[Math.floor(Math.random() * keys.length)];
        typeInstruction = scenarioTypes[randomKey];
      }

      const basePrompt = currentRoundType === 'BOSS_FIGHT'
        ? SYSTEM_INSTRUCTIONS.BOSS_GENERATOR
        : SYSTEM_INSTRUCTIONS.SCENARIO_GENERATOR;

      const prompt = basePrompt
        .replace('{{PLAYER_COUNT}}', playerCount.toString())
        .replace('{{PLAYERS_JSON}}', playersJson)
        .replace('{{PLAYERS}}', playersList)
        .replace('{{PREVIOUS_GM_NOTES}}', prevGmNotesStr)
        .replace('{{LANGUAGE}}', language === 'ru' ? 'Russian' : 'English')
        .replace('{{THEME}}', typeInstruction)
        .replace('{{ROLE}}', role)
        .replace('{{INCIDENT}}', incident)
        .replace('{{TWIST}}', twist)
        .replace('{{TWIST_TYPE}}', twistType)
        .replace('{{CHOSEN_PLAYER_ID}}', chosenPlayerId || "NULL");

      console.log(`[Gemini Request] Model: ${modelName}, Task: SCENARIO_GENERATOR`);

      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
        config: {
          // Enable Reasoning for Gemini 3
          // @ts-ignore - Ignore type error if SDK version is slightly older
          thinkingConfig: modelName.includes('gemini-3') ? { thinkingLevel: "low" } : undefined,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              gm_notes: {
                type: Type.OBJECT,
                properties: {
                  hidden_threat_logic: { type: Type.STRING },
                  solution_clues: { type: Type.STRING },
                  sanity_check: { type: Type.STRING }
                }
              },
              scenario_text: { type: Type.STRING },
              secrets: { type: Type.OBJECT } // For dynamic player_id keys
            },
            required: ["scenario_text", "gm_notes", "secrets"]
          }
        }
      });

      const text = response.text;
      if (!text) throw new Error("Empty response from AI");

      console.log(`\n================== [GEMINI RAW OUTPUT: SCENARIO & SECRETS] ==================\n${text}\n=============================================================================\n`);

      try {
        const jsonResponse = extractJSON(text);
        if (!jsonResponse) throw new Error("Could not extract JSON");
        return jsonResponse as ScenarioResponse;
      } catch (parseError) {
        console.warn("Gemini returned non-JSON text, falling back to raw text wrap.");
        return {
          scenario_text: text,
          gm_notes: {
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
    // CHEAT_DETECTOR disabled to save quota and latency
    return { isCheat: false };
  },

  /**
   * Judges the round outcome.
   */
  judgeRound: async (
    keyManager: KeyManager,
    scenario: ScenarioResponse,
    players: Player[],
    mode: GameMode,
    playerSecrets?: Record<string, string>, // Optional context
    language: Language = 'en',
    aiLevel: AIModelLevel = AIModelLevel.BALANCED,
    playerStates?: Record<string, import('../../types').PlayerState>,
    nextRoundType: import('../../types').RoundType = 'NORMAL'
  ): Promise<RoundResult> => {

    // Fallback Result in case all retries fail
    const fallbackResult: RoundResult = {
      story: language === 'ru'
        ? "Связь с ИИ потеряна. Система экстренно завершает симуляцию."
        : "Connection to AI lost. The system is aborting the simulation.",
      survivors: players.map(p => p.id),
      deaths: [],
      playerStates: playerStates || {},
      gm_notes: {
        hidden_threat_logic: "Связь потеряна.",
        solution_clues: "Связь потеряна.",
        sanity_check: "Связь потеряна."
      }
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
        const playerStatesStr = playerStates ? JSON.stringify(playerStates, null, 2) : "{}";
        let prompt = SYSTEM_INSTRUCTIONS.JUDGE_BASE
          .replace('{{SCENARIO_TEXT}}', JSON.stringify(scenario, null, 2))
          .replace('{{PLAYER_ACTIONS_JSON}}', JSON.stringify(inputs, null, 2))
          .replace('{{PLAYER_STATES_JSON}}', playerStatesStr)
          .replace('{{PLAYER_SECRETS_JSON}}', JSON.stringify(playerSecrets || {}, null, 2))
          .replace('{{GAME_MODE}}', modeInstruction);

        // Prepend language instruction
        prompt = `
              CONTEXT:
              ${langInstruction}

              ${prompt}
            `;

        if (nextRoundType === 'BOSS_FIGHT') {
          const telegraphInstruction = language === 'ru'
            ? "\n\n[SYSTEM OVERRIDE]: Следующий раунд гарантированно будет битвой с могущественным БОССОМ. Финализируя историю этого раунда, ОБЯЗАТЕЛЬНО добавь в самый конец повествования (в поле story) нагнетающий тизер/предвестие приближения ужасающего Босса. Опиши признаки его появления, звуки или визуальные эффекты, чтобы игроки поняли: худшее впереди. Кратко продублируй суть тизера в поле gm_notes.next_round_telegraph."
            : "\n\n[SYSTEM OVERRIDE]: The next round is guaranteed to be a BOSS FIGHT. When finalizing the story for this round, you MUST append a suspenseful teaser/omen of the terrifying Boss's arrival at the very end of the 'story' field. Describe signs of its approach, sounds, or visual effects so players know the worst is yet to come. Briefly duplicate the essence of this teaser in the 'gm_notes.next_round_telegraph' field.";
          prompt += telegraphInstruction;
        }

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
                },
                playerStates: { type: Type.OBJECT },
                gm_notes: {
                  type: Type.OBJECT,
                  properties: {
                    hidden_threat_logic: { type: Type.STRING },
                    solution_clues: { type: Type.STRING },
                    sanity_check: { type: Type.STRING },
                    next_round_telegraph: { type: Type.STRING }
                  }
                }
              },
              required: ["story", "survivors", "deaths", "playerStates", "gm_notes"]
            }
          }
        });

        const text = response.text;
        if (!text) throw new Error("Empty response from AI");

        console.log(`\n================== [GEMINI RAW OUTPUT: JUDGE ROUND] ==================\n${text}\n======================================================================\n`);

        const jsonResponse = extractJSON(text);
        if (!jsonResponse) throw new Error("Could not extract JSON from Judge");
        return jsonResponse as RoundResult;
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
