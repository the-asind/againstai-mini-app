import { Server } from 'socket.io';
import { GameState, GameStatus, LobbySettings, Player, ImageGenerationMode, ScenarioType, GameMode, RoundResult, Language, AIModelLevel, ScenarioResponse } from '../../types';
import { GeminiService } from './geminiService';
import { ImageService } from './imageService';
import { VoiceService } from './voiceService';
import { NavyService } from './navyService';
import { KeyManager } from '../utils/keyManager';
import { saveImage } from '../utils/fileStorage';
import { CONFIG } from '../config';

interface Lobby {
  lobbyCode: string;
  players: Player[];
  status: GameStatus;
  settings: LobbySettings;
  scenario: ScenarioResponse | null;
  scenarioImage?: string;
  scenarioAudio?: string;
  roundResult?: RoundResult;
  geminiKeys: string[];
  navyKeys: string[];
  resultsRevealed: boolean;
}

export class LobbyService {
  private io: Server;
  private lobbies: Map<string, Lobby> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(io: Server) {
    this.io = io;
  }

  // Create a new lobby
  public createLobby(player: Player, settings: LobbySettings, socketId: string): string {
    const code = this.generateLobbyCode();

    // Ensure player is captain
    player.isCaptain = true;
    player.status = 'waiting';
    player.isOnline = true; // Ensure online

    const lobby: Lobby = {
        lobbyCode: code,
        players: [player],
        status: GameStatus.LOBBY_WAITING,
        settings: settings,
        scenario: null,
        resultsRevealed: false,
        geminiKeys: [],
        navyKeys: []
    };

    this.lobbies.set(code, lobby);
    // this.handleDisconnect(player.id, "old_socket_if_any"); // Removed to avoid premature disconnects
    return code;
  }

  // Join existing lobby
  public joinLobby(code: string, player: Player, socketId: string): boolean {
      const lobby = this.lobbies.get(code);
      if (!lobby) return false;

      // Reconnection logic
      const existingPlayer = lobby.players.find(p => p.id === player.id);
      if (existingPlayer) {
          existingPlayer.isOnline = true;
          // Update name/avatar if changed
          existingPlayer.name = player.name;
          if (player.avatarUrl) existingPlayer.avatarUrl = player.avatarUrl;
          existingPlayer.keyCount = player.keyCount;
          // Preserve status
          return true;
      }

      // New player
      if (lobby.status !== GameStatus.LOBBY_WAITING && lobby.status !== GameStatus.LOBBY_SETUP) {
          // Allow rejoin but maybe not new join?
          // For now, allow join if lobby exists, but they might be spectators until next round.
          // Actually, game logic implies locked after start usually.
          // But code allows join.
      }

      player.isCaptain = false;
      player.status = 'waiting';
      player.isOnline = true;
      lobby.players.push(player);

      this.emitUpdate(code);
      return true;
  }

  public isPlayerInLobby(code: string, playerId: string): boolean {
      const lobby = this.lobbies.get(code);
      return !!lobby?.players.find(p => p.id === playerId);
  }

  public isCaptain(code: string, playerId: string): boolean {
      const lobby = this.lobbies.get(code);
      const player = lobby?.players.find(p => p.id === playerId);
      return !!player?.isCaptain;
  }

  public updateSettings(code: string, playerId: string, settings: Partial<LobbySettings>) {
      const lobby = this.lobbies.get(code);
      if (!lobby) return;

      // Merge settings
      lobby.settings = { ...lobby.settings, ...settings };
      this.emitUpdate(code);
  }

  public updatePlayer(code: string, playerId: string, updates: Partial<Player>) {
      const lobby = this.lobbies.get(code);
      if (!lobby) return;

      const player = lobby.players.find(p => p.id === playerId);
      if (player) {
          Object.assign(player, updates);
          this.emitUpdate(code);
      }
  }

  public receiveKeys(code: string, playerId: string, keys: { gemini?: string, navy?: string }) {
      const lobby = this.lobbies.get(code);
      if (!lobby) return;

      if (keys.gemini && !lobby.geminiKeys.includes(keys.gemini)) {
          lobby.geminiKeys.push(keys.gemini);
      }
      if (keys.navy && !lobby.navyKeys.includes(keys.navy)) {
          lobby.navyKeys.push(keys.navy);
      }
  }

  public handleDisconnect(playerId: string, socketId: string) {
      // Find lobbies where this player is
      this.lobbies.forEach(lobby => {
          const player = lobby.players.find(p => p.id === playerId);
          if (player) {
              // Mark offline
              player.isOnline = false;
              this.emitUpdate(lobby.lobbyCode);
          }
      });
  }

  private generateLobbyCode(): string {
      const maxRetries = 10;
      let attempts = 0;

      while (attempts < maxRetries) {
          const code = Math.random().toString(36).substring(2, 8).toUpperCase();
          if (!this.lobbies.has(code)) {
              return code;
          }
          attempts++;
      }

      throw new Error("Failed to generate unique lobby code after 10 attempts.");
  }

  public async startGame(code: string, playerId: string) {
    const lobby = this.lobbies.get(code);
    if (!lobby || !this.isCaptain(code, playerId)) return;

    lobby.status = GameStatus.LOBBY_STARTING;
    this.emitUpdate(code);

    // Request keys from clients
    this.io.to(code).emit('request_keys');

    // Polling for keys (max 5 seconds)
    const maxWaitTime = 5000;
    const pollInterval = 200;
    let waited = 0;

    while (waited < maxWaitTime) {
        if (lobby.geminiKeys.length > 0) {
            break;
        }
        await new Promise(r => setTimeout(r, pollInterval));
        waited += pollInterval;
    }

    if (lobby.geminiKeys.length === 0) {
        lobby.status = GameStatus.LOBBY_WAITING;
        this.io.to(code).emit('error', { message: "No Gemini API Keys provided by players!" });
        this.emitUpdate(code);
        return;
    }

    lobby.status = GameStatus.SCENARIO_GENERATION;
    this.emitUpdate(code);

    try {
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
                if (lobby.navyKeys.length > 0) {
                    const prompt = `create image рассказа ниже. Изображай игроков в ситуации в виде чёрных силуэтов. Стиль реализма, кадр снят от лица "наблюдателя" откуда-то сверху, создавая эффект "подглядывания" за героями. Картика показывает всю "красоту" помещения и располагает к себе внимание завораживая. Все элементы хитро переплетены на холсте:\n${scenario.scenario_text}`;

                    // Use Smart Allocation for Image
                    const base64 = await NavyService.executeWithSmartAllocation(
                        lobby.navyKeys,
                        'IMAGE',
                        async (apiKey) => {
                            // Pass raw key now (service refactored)
                            return ImageService.generateImage(apiKey, prompt);
                        }
                    );

                    if (base64) {
                        const url = await saveImage(base64);
                        lobby.scenarioImage = url;
                    }
                } else {
                    console.warn("Image generation requested but no Navy keys available.");
                }
            } catch (e) {
                console.error("Scenario Image Gen Failed:", e);
            }
        }

        // Voice Generation (SCENARIO)
        if (lobby.settings.voiceoverScenario) {
            try {
                if (lobby.navyKeys.length > 0) {
                    // Use Smart Allocation for Voice
                    const voiceUrl = await NavyService.executeWithSmartAllocation(
                        lobby.navyKeys,
                        'VOICE',
                        async (apiKey) => {
                             // Pass raw key now (service refactored)
                            return VoiceService.generateVoice(apiKey, scenario.scenario_text);
                        }
                    );

                    if (voiceUrl) {
                        lobby.scenarioAudio = voiceUrl;
                    }
                } else {
                    console.warn("Scenario Voice requested but no Navy keys available.");
                }
            } catch (e) {
                console.error("Scenario Voice Gen Failed:", e);
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
                if (lobby.navyKeys.length > 0) {
                     const prompt = `create image рассказа о происшествии ниже. Изображай игроков в ситуации в виде чёрных силуэтов. Реалистичный стиль. Кадр как из экшн-боевика, показывает живность действий героев — их поступки из рассказа. Каждый герой в активной фазе своего действия крупным планом. В итоге собирается коллаж из всех или самых ключевых героев, как в комиксе:\n${result.story}`;

                     // Use Smart Allocation for Image
                     const base64 = await NavyService.executeWithSmartAllocation(
                        lobby.navyKeys,
                        'IMAGE',
                        async (apiKey) => {
                             // Pass raw key now (service refactored)
                            return ImageService.generateImage(apiKey, prompt);
                        }
                     );

                     if (base64) {
                         const url = await saveImage(base64);
                         result.image = url;
                     }
                 } else {
                     console.warn("Result Image generation requested but no Navy keys available.");
                 }
             } catch (e) {
                 console.error("Result Image Gen Failed:", e);
             }
         } else if (lobby.settings.imageGenerationMode === ImageGenerationMode.SCENARIO) {
             result.image = lobby.scenarioImage;
         }

         // Voice Generation (RESULTS)
         if (lobby.settings.voiceoverResults) {
             try {
                 if (lobby.navyKeys.length > 0) {
                     // Use Smart Allocation for Voice
                     const voiceUrl = await NavyService.executeWithSmartAllocation(
                        lobby.navyKeys,
                        'VOICE',
                        async (apiKey) => {
                             // Pass raw key now (service refactored)
                            return VoiceService.generateVoice(apiKey, result.story);
                        }
                     );

                     if (voiceUrl) {
                         result.audio = voiceUrl;
                     }
                 } else {
                     console.warn("Result Voice requested but no Navy keys available.");
                 }
             } catch (e) {
                 console.error("Result Voice Gen Failed:", e);
             }
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
      const lobby = this.lobbies.get(code); // Safe access

      if (!lobby) return;

      if (lobby.status === GameStatus.RESULTS && !lobby.resultsRevealed) {
          lobby.resultsRevealed = true;
          this.emitUpdate(code);
      }
  }

  public resetGame(code: string, playerId: string) {
      if (!this.isCaptain(code, playerId)) return;
      const lobby = this.lobbies.get(code); // Safe access

      if (!lobby) return;

      lobby.status = GameStatus.LOBBY_WAITING;
      lobby.scenario = null;
      lobby.scenarioImage = undefined;
      lobby.scenarioAudio = undefined;
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
            scenarioAudio: lobby.scenarioAudio,
            roundResult: lobby.roundResult,
            resultsRevealed: lobby.resultsRevealed
            // geminiKeys and navyKeys are EXCLUDED
        };
        this.io.to(code).emit('game_state', clientState);
    }
  }
}
