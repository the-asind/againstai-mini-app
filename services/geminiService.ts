
import { GoogleGenAI, Type } from "@google/genai";
import { SYSTEM_INSTRUCTIONS } from "../prompts";
import { GameMode, Player, RoundResult, Language, ScenarioType } from "../types";
import { MODELS } from "../constants";

// Helper to get client with dynamic key
const getClient = (apiKey: string) => new GoogleGenAI({ apiKey: apiKey.trim() });

// Mock result for testing flow without API usage
const MOCK_RESULT: RoundResult = {
  story: "The simulation flickers. In the absence of a true AI overseer, the system defaults to a standard protocol. The blast doors open, revealing a path to safety, though the air remains thick with the scent of ozone and fear. Everyone survives this round, but the system is watching.",
  survivors: [], // Will be filled dynamically
  deaths: []
};

export const GeminiService = {
  /**
   * Generates a scenario using Gemini 3 Pro (Thinking)
   */
  generateScenario: async (apiKey: string, mode: GameMode, type: ScenarioType): Promise<string> => {
    // Mock Mode Check
    if (!apiKey || apiKey.length < 10) {
       await new Promise(r => setTimeout(r, 1500));
       return `MOCK SCENARIO (${type}): You are trapped in a simulation that matches your selected theme. Glitches appear in the sky.`;
    }

    try {
      const ai = getClient(apiKey);
      
      let selectedType = type;

      // Handle "ANY": Pick a random key from defined scenario types
      if (selectedType === ScenarioType.ANY) {
        const options = Object.keys(SYSTEM_INSTRUCTIONS.SCENARIO_TYPES) as (keyof typeof SYSTEM_INSTRUCTIONS.SCENARIO_TYPES)[];
        const randomKey = options[Math.floor(Math.random() * options.length)];
        // Map string key back to ScenarioType if needed, strictly speaking we just need the instruction
        // We can just use the randomKey to fetch instruction directly
        const instruction = SYSTEM_INSTRUCTIONS.SCENARIO_TYPES[randomKey];
        const combinedInstruction = `${SYSTEM_INSTRUCTIONS.SCENARIO_GENERATOR}\n\n${instruction}`;
        
        const response = await ai.models.generateContent({
          model: MODELS.SMART,
          contents: `Generate a survival scenario for a ${mode} game mode.`,
          config: {
            systemInstruction: combinedInstruction,
            thinkingConfig: { thinkingBudget: 1024 }, 
          }
        });
        return response.text || "Failed to generate scenario.";
      }

      // Normal selection
      // Cast type to string to index into SCENARIO_TYPES safely
      const typeKey = type as unknown as keyof typeof SYSTEM_INSTRUCTIONS.SCENARIO_TYPES;
      const specificInstruction = SYSTEM_INSTRUCTIONS.SCENARIO_TYPES[typeKey] || SYSTEM_INSTRUCTIONS.SCENARIO_TYPES.sci_fi;
      const combinedInstruction = `${SYSTEM_INSTRUCTIONS.SCENARIO_GENERATOR}\n\n${specificInstruction}`;

      const response = await ai.models.generateContent({
        model: MODELS.SMART,
        contents: `Generate a survival scenario for a ${mode} game mode.`,
        config: {
          systemInstruction: combinedInstruction,
          thinkingConfig: { thinkingBudget: 1024 }, 
        }
      });

      return response.text || "Failed to generate scenario.";
    } catch (error) {
      console.error("Scenario generation failed", error);
      return "The system is malfunctioning. You are trapped in a void with no clear exit. (Fallback Scenario)";
    }
  },

  /**
   * Checks for cheats using Gemini 2.5 Flash Lite (Low Latency)
   */
  checkInjection: async (apiKey: string, actionText: string): Promise<{ isCheat: boolean; reason?: string }> => {
    if (!apiKey || apiKey.length < 10) return { isCheat: false };

    try {
      const ai = getClient(apiKey);

      const response = await ai.models.generateContent({
        model: MODELS.FAST,
        contents: `Player Action: "${actionText}"`,
        config: {
          systemInstruction: SYSTEM_INSTRUCTIONS.CHEAT_DETECTOR,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              isCheat: { type: Type.BOOLEAN },
              reason: { type: Type.STRING },
            },
            required: ["isCheat"]
          }
        }
      });

      const json = JSON.parse(response.text || "{}");
      return json;
    } catch (e) {
      console.error("Failed to parse cheat check", e);
      return { isCheat: false }; // Fail open if AI fails
    }
  },

  /**
   * Judges the round using Gemini 3 Pro (High Thinking)
   */
  judgeRound: async (
    apiKey: string, 
    scenario: string, 
    players: Player[],
    storyLanguage: Language,
    mode: GameMode
  ): Promise<RoundResult> => {
    // 1. Handle Mock/Empty Key Mode explicitly to prevent hanging
    if (!apiKey || apiKey.length < 10) {
      console.warn("Using Mock Result due to missing API Key");
      await new Promise(r => setTimeout(r, 2000)); // Simulate thinking
      return {
        ...MOCK_RESULT,
        survivors: players.map(p => p.id),
      };
    }

    try {
      const ai = getClient(apiKey);

      const inputs = players.map(p => ({
        id: p.id,
        name: p.name,
        action: p.actionText || "No action taken."
      }));

      const langInstruction = storyLanguage === 'ru' ? "Write the story in RUSSIAN." : "Write the story in ENGLISH.";
      
      // Select specific instructions based on Game Mode
      const modeInstruction = SYSTEM_INSTRUCTIONS.GAME_MODES[mode] || SYSTEM_INSTRUCTIONS.GAME_MODES.coop;
      const combinedSystemInstruction = `${SYSTEM_INSTRUCTIONS.JUDGE_BASE}\n\n${modeInstruction}`;

      const prompt = `
        ${langInstruction}
        Scenario: ${scenario}
        Players Actions: ${JSON.stringify(inputs)}
      `;

      const response = await ai.models.generateContent({
        model: MODELS.SMART,
        contents: prompt,
        config: {
          systemInstruction: combinedSystemInstruction,
          thinkingConfig: { thinkingBudget: 2048 }, 
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
            }
          }
        }
      });

      const text = response.text || "";
      const cleanJson = text.replace(/```json|```/g, "").trim();
      return JSON.parse(cleanJson) as RoundResult;

    } catch (e) {
        console.error("Judge Parsing Error or API Failure", e);
        
        // Return a valid result object even on error so the game proceeds
        return {
            story: storyLanguage === 'ru' 
              ? "ИИ столкнулся с критической ошибкой при обработке данных. В результате сбоя системы безопасности, шлюзы открылись, и все игроки смогли покинуть опасную зону невредимыми. (Это автоматический ответ при ошибке API)"
              : "The AI encountered a critical error processing the data. Due to a security failure, the gates opened, and all players managed to escape the danger zone unharmed. (This is a fallback response due to API error).",
            survivors: players.map(p => p.id),
            deaths: []
        };
    }
  }
};