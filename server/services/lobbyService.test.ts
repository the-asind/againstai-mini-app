
import { test, describe, expect, mock } from 'bun:test';

// Mock local dependencies that import external ones
mock.module("./geminiService", () => ({
  GeminiService: {
    generateScenario: () => Promise.resolve("Mock Scenario"),
    judgeRound: () => Promise.resolve({ story: "Mock Story", survivors: [], deaths: [] }),
    checkInjection: () => Promise.resolve({ isCheat: false }),
    validateKey: () => Promise.resolve(true)
  }
}));

mock.module("socket.io", () => ({
  Server: class {
    to() { return { emit: () => {} }; }
  }
}));

// Now import the service
import { LobbyService } from './lobbyService';
import { Player, GameMode, ScenarioType, GameStatus } from '../../types';

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
    status: 'alive'
  });

  const getSettings = () => ({
    timeLimitSeconds: 120,
    charLimit: 500,
    mode: GameMode.PVP,
    scenarioType: ScenarioType.SCI_FI,
    apiKey: 'sk-test-123',
    storyLanguage: 'en' as const,
    aiModelLevel: 'premium' as const
  });

  test('createLobby should return a 6-character code with allowed characters', () => {
    const lobbyService = new LobbyService(mockIO);
    const code = lobbyService.createLobby(getHost(), getSettings());

    expect(typeof code).toBe('string');
    expect(code).toHaveLength(6);
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
  });

  test('createLobby should correctly initialize lobby state', () => {
    const lobbyService = new LobbyService(mockIO);
    const host = getHost();
    const settings = getSettings();

    const code = lobbyService.createLobby(host, settings);
    const lobby = (lobbyService as any).lobbies.get(code);

    expect(lobby).toBeDefined();
    expect(lobby.lobbyCode).toBe(code);
    expect(lobby.status).toBe(GameStatus.LOBBY_WAITING);
    expect(lobby.settings).toEqual(settings);
    expect(lobby.scenario).toBeNull();

    expect(lobby.players).toHaveLength(1);
    const createdPlayer = lobby.players[0];
    expect(createdPlayer.id).toBe(host.id);
    expect(createdPlayer.name).toBe(host.name);
    expect(createdPlayer.isCaptain).toBe(true);
    expect(createdPlayer.status).toBe('waiting');
  });

  test('createLobby should generate unique codes', () => {
    const lobbyService = new LobbyService(mockIO);
    const host = getHost();
    const settings = getSettings();

    const codes = new Set();
    for (let i = 0; i < 100; i++) {
      const code = lobbyService.createLobby(host, settings);
      expect(codes.has(code)).toBe(false);
      codes.add(code);
    }
    expect(codes.size).toBe(100);
  });
});
