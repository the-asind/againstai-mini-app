import { Server as SocketIOServer } from 'socket.io';
import { GameState, ServerGameState, GameStatus, LobbySettings, Player, RoundResult, GameMode, ScenarioType, ImageGenerationMode } from '../../types';
import { GeminiService } from './geminiService';
import { CONFIG } from '../config';
import { saveImage } from '../utils/imageStorage';
import { KeyManager } from '../utils/keyManager';

const LOBBY_CODE_LENGTH = 6;
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export class LobbyService {
  private lobbies: Map<string, ServerGameState> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private playerSockets: Map<string, Set<string>> = new Map();
  private keyCollectors: Map<string, Map<string, { gemini?: string, navy?: string }>> = new Map();
  private io: SocketIOServer;

  constructor(io: SocketIOServer) {
    this.io = io;
  }

  public isCaptain(code: string, playerId: string): boolean {
    const lobby = this.lobbies.get(code);
    if (!lobby) return false;
    const player = lobby.players.find(p => p.id === playerId);
    return player?.isCaptain || false;
  }

  public isPlayerInLobby(code: string, playerId: string): boolean {
    const lobby = this.lobbies.get(code);
    if (!lobby) return false;
    return lobby.players.some(p => p.id === playerId);
  }

  private generateCode(): string {
    let result = '';
    for (let i = 0; i < LOBBY_CODE_LENGTH; i++) {
      result += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
    }
    if (this.lobbies.has(result)) return this.generateCode();
    return result;
  }

  public createLobby(host: Player, settings: LobbySettings, socketId: string): string {
    const code = this.generateCode();
    const initialState: ServerGameState = {
      lobbyCode: code,
      players: [{ ...host, isCaptain: true, status: 'waiting', isOnline: true, keyCount: host.keyCount || 0 }],
      status: GameStatus.LOBBY_WAITING,
      settings: settings,
      scenario: null,
      geminiKeys: [],
      navyKeys: []
      resultsRevealed: false
    };

    this.lobbies.set(code, initialState);
    this.playerSockets.set(host.id, new Set([socketId]));
    return code;
  }

  public joinLobby(code: string, player: Player, socketId: string): boolean {
    const lobby = this.lobbies.get(code);
    if (!lobby) return false;

    const existingIndex = lobby.players.findIndex(p => p.id === player.id);
    if (existingIndex !== -1) {
        lobby.players[existingIndex] = {
            ...lobby.players[existingIndex],
            name: player.name,
            isOnline: true,
            keyCount: player.keyCount // update key count if re-joining
        };
    } else {
        if (lobby.status !== GameStatus.LOBBY_WAITING && lobby.status !== GameStatus.LOBBY_SETUP) {
            return false;
        }
        lobby.players.push({ ...player, isCaptain: false, status: 'waiting', isOnline: true, keyCount: player.keyCount || 0 });
    }

    if (!this.playerSockets.has(player.id)) {
        this.playerSockets.set(player.id, new Set());
    }
    this.playerSockets.get(player.id)!.add(socketId);

    this.emitUpdate(code);
    return true;
  }

  public handleDisconnect(playerId: string, socketId: string) {
    const userSockets = this.playerSockets.get(playerId);
    if (userSockets) {
        userSockets.delete(socketId);
        if (userSockets.size === 0) {
            this.setPlayerOffline(playerId);
        }
    }
  }

  private setPlayerOffline(playerId: string) {
      for (const [code, lobby] of this.lobbies.entries()) {
          const player = lobby.players.find(p => p.id === playerId);
          if (player) {
              player.isOnline = false;
              this.emitUpdate(code);
              break;
          }
      }
  }

  public updateSettings(code: string, playerId: string, settings: Partial<LobbySettings>) {
    if (!this.isCaptain(code, playerId)) return;
    const lobby = this.lobbies.get(code)!;

    lobby.settings = { ...lobby.settings, ...settings };
    this.emitUpdate(code);
  }

  public updatePlayer(code: string, playerId: string, updates: Partial<Player>) {
    const lobby = this.lobbies.get(code);
    if (!lobby) return;

    const player = lobby.players.find(p => p.id === playerId);
    if (player) {
        let changed = false;
        // Only allow updating specific fields for now
        if (updates.name && updates.name.trim() !== '' && updates.name !== player.name) {
             player.name = updates.name.substring(0, 20); // Limit length
             changed = true;
        }
        if (updates.keyCount !== undefined && updates.keyCount !== player.keyCount) {
             player.keyCount = updates.keyCount;
             changed = true;
        }

        if (changed) {
            this.emitUpdate(code);
        }
    }
  }

  /**
   * Called by socket handler when client responds to request_keys
   */
  public receiveKeys(code: string, playerId: string, keys: { gemini?: string, navy?: string }) {
      const collector = this.keyCollectors.get(code);
      if (collector) {
          collector.set(playerId, keys);
      }
  }

  private async collectKeys(code: string): Promise<void> {
      const lobby = this.lobbies.get(code);
      if (!lobby) return;

      // Initialize collector for this session
      const collectorMap = new Map<string, { gemini?: string, navy?: string }>();
      this.keyCollectors.set(code, collectorMap);

      // Request keys from all clients
      this.io.to(code).emit('request_keys');

      // Determine expected responders (active players)
      // We could use all players or only online ones. Let's aim for all online.
      const onlinePlayers = lobby.players.filter(p => p.isOnline).length;

      // Wait for either all responses OR timeout
      await new Promise<void>(resolve => {
          let resolved = false;

          const timeout = setTimeout(() => {
              if (!resolved) {
                  resolved = true;
                  resolve();
              }
          }, 3000); // 3s hard timeout

          // Poll check for early completion
          // Since receiveKeys is synchronous, we can just check periodically or make receiveKeys trigger a check.
          // To keep receiveKeys simple, we'll just poll every 100ms.
          const interval = setInterval(() => {
              if (resolved) {
                  clearInterval(interval);
                  return;
              }
              if (this.keyCollectors.get(code)!.size >= onlinePlayers) {
                  resolved = true;
                  clearTimeout(timeout);
                  clearInterval(interval);
                  resolve();
              }
          }, 100);
      });

      const collectedMap = this.keyCollectors.get(code);
      this.keyCollectors.delete(code);

      if (!collectedMap) return;

      const geminiKeys: string[] = [];
      const navyKeys: string[] = [];

      // Process keys: Captain first!
      const captain = lobby.players.find(p => p.isCaptain);
      if (captain) {
          const capKeys = collectedMap.get(captain.id);
          if (capKeys) {
              if (capKeys.gemini) geminiKeys.push(capKeys.gemini);
              if (capKeys.navy) navyKeys.push(capKeys.navy);
          }
      }

      // Then everyone else
      for (const p of lobby.players) {
          if (p.isCaptain) continue;
          const k = collectedMap.get(p.id);
          if (k) {
              if (k.gemini) geminiKeys.push(k.gemini);
              if (k.navy) navyKeys.push(k.navy);
          }
      }

      lobby.geminiKeys = geminiKeys;
      lobby.navyKeys = navyKeys;
  }

  public async startGame(code: string, playerId: string) {
    if (!this.isCaptain(code, playerId)) return;
    const lobby = this.lobbies.get(code)!;

    // Atomic Guard: Prevent concurrent starts
    if (lobby.status !== GameStatus.LOBBY_WAITING) {
        return;
    }

    // Set transitional state
    lobby.status = GameStatus.LOBBY_STARTING;
    this.emitUpdate(code);

    try {
        // 1. Collect Keys (Async)
        await this.collectKeys(code);

        // 2. Validate Captain Key (Must have at least one key, and captain is prioritized)
        if (lobby.geminiKeys.length === 0) {
            this.io.to(code).emit('error', { errorCode: 'ERR_MISSING_API_KEY', message: "Captain must provide a Gemini API Key to start." });
            lobby.status = GameStatus.LOBBY_WAITING; // Revert status
            this.emitUpdate(code);
            return;
        }

        lobby.status = GameStatus.SCENARIO_GENERATION;
        this.emitUpdate(code);

        const keyManager = new KeyManager(lobby.geminiKeys[0], lobby.geminiKeys.slice(1));

        const lang = lobby.settings.storyLanguage || 'en';

        const scenario = await GeminiService.generateScenario(
            keyManager,
            lobby.settings.mode,
            lobby.settings.scenarioType,
            lobby.players,
            lang,
            lobby.settings.aiModelLevel
        );

        lobby.scenario = scenario;

        // Image Generation (SCENARIO)
        if (lobby.settings.imageGenerationMode !== ImageGenerationMode.NONE) {
            try {
                const prompt = `Create a 16:9 cinematic realistic image visualizing this scene: ${scenario.scenario_text}`;
                const base64 = await GeminiService.generateImage(keyManager, prompt);
                if (base64) {
                    const url = await saveImage(base64);
                    lobby.scenarioImage = url;
                }
            } catch (e) {
                console.error("Scenario Image Gen Failed:", e);
            }
        }

        this.startRound(code);

    } catch (e) {
        console.error(`Lobby ${code} Start Error:`, e);
        lobby.status = GameStatus.LOBBY_WAITING; // Revert status on error
        this.io.to(code).emit('error', { message: "Failed to generate scenario. Check API Key availability." });
        this.emitUpdate(code);
    }
  }

  private startRound(code: string) {
    const lobby = this.lobbies.get(code);
    if (!lobby) return;

    lobby.status = GameStatus.PLAYER_INPUT;
    lobby.resultsRevealed = false; // Reset for new round

    lobby.players.forEach(p => {
        p.status = 'waiting';
        p.actionText = undefined;
    });

    this.emitUpdate(code);

    const timeLimitMs = (lobby.settings.timeLimitSeconds || 120) * 1000;

    if (this.timers.has(code)) clearTimeout(this.timers.get(code)!);

    const timer = setTimeout(() => {
        this.handleTimeout(code);
    }, timeLimitMs);

    this.timers.set(code, timer);
  }

  public async submitAction(code: string, playerId: string, action: string) {
    const lobby = this.lobbies.get(code);
    if (!lobby || lobby.status !== GameStatus.PLAYER_INPUT) return;

    const player = lobby.players.find(p => p.id === playerId);
    if (!player) return;

    // Check for injection/cheating ONLY if we have keys
    if (lobby.geminiKeys.length > 0) {
        // Use KeyManager for cheat check
        const km = new KeyManager(lobby.geminiKeys[0], lobby.geminiKeys.slice(1));
        const check = await GeminiService.checkInjection(km, action);
        if (check.isCheat) {
             // Currently logging only
             console.log(`[Cheat] Player ${player.name} flagged: ${check.reason}`);
        }
    }

    player.actionText = action;
    player.status = 'ready';

    this.emitUpdate(code);

    const waitingSurvivors = lobby.players.filter(p => p.status === 'waiting');

    if (waitingSurvivors.length === 0) {
        this.resolveRound(code);
    }
  }

  private handleTimeout(code: string) {
     const lobby = this.lobbies.get(code);
     if (!lobby) return;

     lobby.players.forEach(p => {
         if (p.status === 'waiting') {
             p.actionText = p.actionText || "Frozen in fear, doing nothing.";
             p.status = 'ready';
         }
     });

     this.resolveRound(code);
  }

  private async resolveRound(code: string) {
     const lobby = this.lobbies.get(code);
     if (!lobby) return;
     if (this.timers.has(code)) {
         clearTimeout(this.timers.get(code)!);
         this.timers.delete(code);
     }

     lobby.status = GameStatus.JUDGING;
     this.emitUpdate(code);

     if (lobby.geminiKeys.length === 0) {
         lobby.status = GameStatus.PLAYER_INPUT;
         this.io.to(code).emit('error', { message: "No API Keys available." });
         this.emitUpdate(code);
         return;
     }

     const keyManager = new KeyManager(lobby.geminiKeys[0], lobby.geminiKeys.slice(1));

     try {
         const lang = lobby.settings.storyLanguage || 'en';

         const safeScenario = lobby.scenario || {
             scenario_text: "Unknown Scenario",
             gm_notes: {
                 analysis: "",
                 hidden_threat_logic: "",
                 solution_clues: "",
                 sanity_check: ""
             }
         };

         const result = await GeminiService.judgeRound(
             keyManager,
             safeScenario,
             lobby.players,
             lobby.settings.mode,
             lang,
             lobby.settings.aiModelLevel
         );

         // Image Generation (RESULTS)
         if (lobby.settings.imageGenerationMode === ImageGenerationMode.FULL) {
             try {
                 const prompt = `Create a 16:9 cinematic realistic image visualizing the aftermath: ${result.story}. Action of each hero separately (black silhouettes), collage in one row.`;
                 const base64 = await GeminiService.generateImage(keyManager, prompt);
                 if (base64) {
                     const url = await saveImage(base64);
                     result.image = url;
                 }
             } catch (e) {
                 console.error("Result Image Gen Failed:", e);
             }
         } else if (lobby.settings.imageGenerationMode === ImageGenerationMode.SCENARIO) {
             result.image = lobby.scenarioImage;
         }

         lobby.roundResult = result;
         lobby.status = GameStatus.RESULTS;
         lobby.resultsRevealed = false; // Ensure it starts hidden

         lobby.players.forEach(p => {
             if (result.survivors.includes(p.id)) {
                 p.status = 'alive';
             } else {
                 p.status = 'dead';
             }
         });

         this.emitUpdate(code);

     } catch (e) {
         console.error(`Lobby ${code} Judge Error:`, e);
         lobby.status = GameStatus.PLAYER_INPUT;
         this.io.to(code).emit('error', { message: "Judging failed." });
         this.emitUpdate(code);
     }
  }

  public revealResults(code: string, playerId: string) {
      if (!this.isCaptain(code, playerId)) return;
      const lobby = this.lobbies.get(code)!;

      if (lobby.status === GameStatus.RESULTS && !lobby.resultsRevealed) {
          lobby.resultsRevealed = true;
          this.emitUpdate(code);
      }
  }

  public resetGame(code: string, playerId: string) {
      if (!this.isCaptain(code, playerId)) return;
      const lobby = this.lobbies.get(code)!;

      lobby.status = GameStatus.LOBBY_WAITING;
      lobby.scenario = null;
      lobby.scenarioImage = undefined;
      lobby.roundResult = undefined;
      lobby.geminiKeys = [];
      lobby.navyKeys = [];

      lobby.resultsRevealed = false;
      lobby.players.forEach(p => {
          p.status = 'waiting';
          p.actionText = undefined;
      });

      this.emitUpdate(code);
  }

  public emitUpdate(code: string) {
    const lobby = this.lobbies.get(code);
    if (lobby) {
        // SECURITY: Explicitly construct client state to avoid leaking keys
        const clientState: GameState = {
            lobbyCode: lobby.lobbyCode,
            players: lobby.players, // Players object is safe (contains public info)
            status: lobby.status,
            settings: lobby.settings,
            scenario: lobby.scenario ? lobby.scenario.scenario_text : null,
            scenarioImage: lobby.scenarioImage,
            roundResult: lobby.roundResult
            // geminiKeys and navyKeys are EXCLUDED
        };
        this.io.to(code).emit('game_state', clientState);
    }
  }
}
