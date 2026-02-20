import { test, describe, expect, mock, spyOn } from 'bun:test';
import { Player, GameMode, ScenarioType, GameStatus, ImageGenerationMode } from '../../types';
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

// Mock Socket.IO
class MockSocket {
    id: string;
    constructor(id: string) { this.id = id; }
    join() {}
    emit() {}
}

const mockEmit = mock(() => {});
mock.module("socket.io", () => ({
  Server: class {
    to() { return { emit: mockEmit }; }
  }
}));

// Now import the service
import { LobbyService } from './lobbyService';

describe('LobbyService', () => {
  const mockIO = {
    to: () => ({
      emit: mockEmit
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
    imageGenerationMode: ImageGenerationMode.NONE
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
    expect(lobby.status).toBe(GameStatus.LOBBY_WAITING);
    expect(lobby.settings).toEqual(settings);
    expect(lobby.scenario).toBeNull();
    expect(lobby.geminiKeys).toEqual([]);
    expect(lobby.players[0].keyCount).toBe(1);
  });

  test('collectKeys should aggregate keys from players', async () => {
      const lobbyService = new LobbyService(mockIO);
      const host = { ...getHost(), isCaptain: true };
      const player2 = { ...getHost(), id: 'p2', name: 'P2', isCaptain: false, keyCount: 1 as const };

      const code = lobbyService.createLobby(host, getSettings(), 's1');
      lobbyService.joinLobby(code, player2, 's2');

      // Start key collection (mocking internal logic access)
      const collectPromise = (lobbyService as any).collectKeys(code);

      // Simulate responses
      lobbyService.receiveKeys(code, host.id, { gemini: 'key-1' });
      lobbyService.receiveKeys(code, player2.id, { gemini: 'key-2' });

      await collectPromise;

      const lobby = (lobbyService as any).lobbies.get(code);
      expect(lobby.geminiKeys).toContain('key-1');
      expect(lobby.geminiKeys).toContain('key-2');
      // Verify order: Captain first
      expect(lobby.geminiKeys[0]).toBe('key-1');
  });

  test('startGame should set status to STARTING and revert on error', async () => {
      const lobbyService = new LobbyService(mockIO);
      const host = { ...getHost(), isCaptain: true };
      const code = lobbyService.createLobby(host, getSettings(), 's1');

      // Mock collectKeys to do nothing effectively, so no keys -> error
      // But startGame is async. We check the transitional state.

      // We can't easily pause execution inside startGame without complex mocking,
      // but we can verify the end state is WAITING (due to "No keys" error)
      // instead of stuck in STARTING.

      await lobbyService.startGame(code, host.id);

      const lobby = (lobbyService as any).lobbies.get(code);
      // Should have reverted to WAITING because no keys were provided
      expect(lobby.status).toBe(GameStatus.LOBBY_WAITING);

      // Verify error emission
      expect(mockEmit).toHaveBeenCalledWith('error', expect.objectContaining({ errorCode: 'ERR_MISSING_API_KEY' }));
  });

  test('startGame requires captain', async () => {
      const lobbyService = new LobbyService(mockIO);
      const host = { ...getHost(), isCaptain: true };
      const p2 = { ...getHost(), id: 'p2', isCaptain: false };
      const code = lobbyService.createLobby(host, getSettings(), 's1');
      lobbyService.joinLobby(code, p2, 's2');

      await lobbyService.startGame(code, p2.id); // Non-captain tries to start

      const lobby = (lobbyService as any).lobbies.get(code);
      expect(lobby.status).toBe(GameStatus.LOBBY_WAITING);
  });
});
