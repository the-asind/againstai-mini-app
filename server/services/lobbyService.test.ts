import { test, describe, expect, mock } from 'bun:test';
import { Player, GameMode, ScenarioType, GameStatus } from '../../types';
import { join } from 'path';

// Mock KeyManager
mock.module(join(import.meta.dir, "../utils/keyManager.ts"), () => ({
  KeyManager: class {
    executeWithRetry(fn: any) { return fn('mock-key'); }
  }
}));

// Mock @google/genai globally just in case
mock.module("@google/genai", () => ({
    GoogleGenAI: class {},
    Type: {}, Modality: { IMAGE: "IMAGE" }
}));

// Mock local dependencies that import external ones
// Use absolute path to ensure we intercept
mock.module(join(import.meta.dir, "geminiService.ts"), () => ({
  GeminiService: {
    generateScenario: () => Promise.resolve({
        scenario_text: "Mock Scenario",
        gm_notes: {
            analysis: "Mock Analysis",
            hidden_threat_logic: "Mock Threat",
            solution_clues: "Mock Clue",
            sanity_check: "Mock Sanity"
        }
    }),
    judgeRound: () => Promise.resolve({ story: "Mock Story", survivors: [], deaths: [] }),
    checkInjection: () => Promise.resolve({ isCheat: false }),
    validateKey: () => Promise.resolve(true),
    generateImage: () => Promise.resolve(null)
  }
}));

mock.module("socket.io", () => ({
  Server: class {
    to() { return { emit: () => {} }; }
  }
}));

// Now import the service
import { LobbyService } from './lobbyService';

describe('LobbyService', () => {
  const mockIO = {
    to: () => ({
      emit: () => {}
    })
  } as any;

  const getHost = (): Player => ({
    id: 'host-1',
    name: 'Host Player',
    isCaptain: false,
    status: 'alive',
    isOnline: true,
    keyCount: 1
  });

  const getSettings = () => ({
    timeLimitSeconds: 120,
    charLimit: 500,
    mode: GameMode.PVP,
    scenarioType: ScenarioType.SCI_FI,
    storyLanguage: 'en' as const,
    aiModelLevel: 'premium' as const,
    imageGenerationMode: 'none' as any
  });

  const mockSocketId = 'socket-123';

  test('createLobby should return a 6-character code', () => {
    const lobbyService = new LobbyService(mockIO);
    const code = lobbyService.createLobby(getHost(), getSettings(), mockSocketId);

    expect(typeof code).toBe('string');
    expect(code).toHaveLength(6);
  });

  test('createLobby should correctly initialize lobby state', () => {
    const lobbyService = new LobbyService(mockIO);
    const host = getHost();
    const settings = getSettings();

    const code = lobbyService.createLobby(host, settings, mockSocketId);
    const lobby = (lobbyService as any).lobbies.get(code);

    expect(lobby).toBeDefined();
    expect(lobby.lobbyCode).toBe(code);
    expect(lobby.geminiKeys).toEqual([]);
    expect(lobby.players[0].keyCount).toBe(1);
  });
});
