
/**
 * MOCK BACKEND SERVICE
 * 
 * DESIGN NOTE FOR DEVELOPERS:
 * This file strictly mocks the functionalities that would typically require a real backend server,
 * database (Postgres/Redis), and WebSocket connection (Socket.io).
 * 
 * TO REPLACE WITH REAL BACKEND:
 * 1. Create a `RealBackendService` implementing the same interface.
 * 2. Replace `setTimeout` simulations with actual API calls (fetch/axios) and WebSocket emitters.
 * 3. Store `GameState` on the server, not in local variables.
 */

import { GameState, GameStatus, Player, LobbySettings, GameMode, ScenarioType } from "../types";
import { MOCK_BOT_DELAY_MS, MOCK_BOT_JOIN_DELAY_MS } from "../constants";

// In-memory mock storage
let currentState: GameState | null = null;
let subscribers: ((state: GameState) => void)[] = [];

// Mock Bot Data
const MOCK_BOT: Player = {
  id: 'bot_gemini_fan',
  name: 'Alex (Bot)',
  isCaptain: false,
  status: 'waiting'
};

const notifySubscribers = () => {
  if (currentState) {
    // Create a new object reference for the state to ensure React re-renders
    subscribers.forEach(cb => cb({ ...currentState! }));
  }
};

export const MockBackend = {
  subscribe: (callback: (state: GameState) => void) => {
    subscribers.push(callback);
    // Initial data
    if (currentState) callback(currentState);
    return () => {
      subscribers = subscribers.filter(s => s !== callback);
    };
  },

  createLobby: async (player: Player, settings: LobbySettings): Promise<string> => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    currentState = {
      lobbyCode: code,
      players: [player],
      status: GameStatus.LOBBY_WAITING,
      settings: settings,
      scenario: null
    };
    notifySubscribers();

    // Simulate a bot joining after delay to allow testing
    setTimeout(() => {
        if (currentState && currentState.status === GameStatus.LOBBY_WAITING) {
            // Immutable update for players
            if (currentState) {
                currentState.players = [...currentState.players, MOCK_BOT];
                notifySubscribers();
            }
        }
    }, MOCK_BOT_JOIN_DELAY_MS);

    return code;
  },

  joinLobby: async (code: string, player: Player): Promise<boolean> => {
    // In mock mode, we accept any 6 char code if a lobby exists, or create a fake one
    if (!currentState) {
       // Auto-create a lobby if joining via deep link without creating one first (for demo)
       currentState = {
           lobbyCode: code,
           players: [{...MOCK_BOT, isCaptain: true}, player],
           status: GameStatus.LOBBY_WAITING,
           settings: { mode: GameMode.COOP, scenarioType: ScenarioType.SCI_FI, timeLimitSeconds: 60, charLimit: 500, apiKey: '', storyLanguage: 'en' },
           scenario: null
       };
    } else {
        if (currentState.players.find(p => p.id === player.id)) return true;
        // Immutable update
        currentState.players = [...currentState.players, player];
    }
    notifySubscribers();
    return true;
  },

  updateStatus: (status: GameStatus) => {
    if (!currentState) return;
    currentState = { ...currentState, status }; // Strict immutable update
    notifySubscribers();
  },

  updateSettings: (settings: Partial<LobbySettings>) => {
    if (!currentState) return;
    currentState = { 
        ...currentState, 
        settings: { ...currentState.settings, ...settings } 
    };
    notifySubscribers();
  },

  setScenario: (scenario: string) => {
    if (!currentState) return;
    currentState = { ...currentState, scenario };
    notifySubscribers();
  },

  submitAction: async (playerId: string, action: string) => {
    if (!currentState) return;
    
    // Immutable update of player status
    currentState.players = currentState.players.map(p => 
        p.id === playerId 
            ? { ...p, actionText: action, status: 'ready' as const } 
            : p
    );

    notifySubscribers();

    // If all real players submitted, simulate Bot submission
    const allHumansReady = currentState.players
        .filter(p => p.id !== MOCK_BOT.id)
        .every(p => p.status === 'ready');

    if (allHumansReady) {
        // Mock bot submits after small delay
        setTimeout(() => {
            if (!currentState) return;
            // Check if bot is already ready to avoid double submission
            const bot = currentState.players.find(p => p.id === MOCK_BOT.id);
            if (bot && bot.status !== 'ready') {
                currentState.players = currentState.players.map(p => 
                    p.id === MOCK_BOT.id 
                        ? { ...p, actionText: "I hide behind the nearest debris and pray silently.", status: 'ready' as const }
                        : p
                );
                notifySubscribers();
            }
        }, 1000);
    }
  },

  applyResults: (survivorIds: string[]) => {
      if(!currentState) return;
      // Immutable update of players array
      currentState = {
          ...currentState,
          players: currentState.players.map(p => ({
            ...p,
            status: survivorIds.includes(p.id) ? 'alive' : 'dead'
          }))
      };
      notifySubscribers();
  },
  
  resetGame: () => {
      if(!currentState) return;
      currentState = {
          ...currentState,
          status: GameStatus.LOBBY_WAITING,
          scenario: null,
          players: currentState.players.map(p => ({
            ...p,
            status: 'waiting',
            actionText: undefined
          }))
      };
      notifySubscribers();
  }
};