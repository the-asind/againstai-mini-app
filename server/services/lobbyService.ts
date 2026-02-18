import { Server as SocketIOServer } from 'socket.io';
import { GameState, GameStatus, LobbySettings, Player, RoundResult, GameMode, ScenarioType, ImageGenerationMode } from '../../types';
import { GeminiService } from './geminiService';
import { CONFIG } from '../config';
import { saveImage } from '../utils/imageStorage';

const LOBBY_CODE_LENGTH = 6;
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export class LobbyService {
  private lobbies: Map<string, GameState> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private playerSockets: Map<string, Set<string>> = new Map();
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
    const initialState: GameState = {
      lobbyCode: code,
      players: [{ ...host, isCaptain: true, status: 'waiting', isOnline: true }],
      status: GameStatus.LOBBY_WAITING,
      settings: settings,
      scenario: null
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
            isOnline: true
        };
    } else {
        if (lobby.status !== GameStatus.LOBBY_WAITING && lobby.status !== GameStatus.LOBBY_SETUP) {
            return false;
        }
        lobby.players.push({ ...player, isCaptain: false, status: 'waiting', isOnline: true });
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

  public async startGame(code: string, playerId: string) {
    if (!this.isCaptain(code, playerId)) return;
    const lobby = this.lobbies.get(code)!;

    lobby.status = GameStatus.SCENARIO_GENERATION;
    this.emitUpdate(code);

    try {
      const lang = lobby.settings.storyLanguage || 'en';

      const scenario = await GeminiService.generateScenario(
        lobby.settings.apiKey,
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
             // Use scenario.scenario_text for image generation
             const prompt = `Create a 16:9 cinematic realistic image visualizing this scene: ${scenario.scenario_text}`;
             const base64 = await GeminiService.generateImage(lobby.settings.apiKey, prompt);
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
      lobby.status = GameStatus.LOBBY_WAITING;
      this.io.to(code).emit('error', { message: "Failed to generate scenario. Check API Key." });
      this.emitUpdate(code);
    }
  }

  private startRound(code: string) {
    const lobby = this.lobbies.get(code);
    if (!lobby) return;

    lobby.status = GameStatus.PLAYER_INPUT;

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

     try {
         const lang = lobby.settings.storyLanguage || 'en';

         // Handle potential missing scenario (though unlikely)
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
             lobby.settings.apiKey,
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
                 const base64 = await GeminiService.generateImage(lobby.settings.apiKey, prompt);
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

  public resetGame(code: string, playerId: string) {
      if (!this.isCaptain(code, playerId)) return;
      const lobby = this.lobbies.get(code)!;

      lobby.status = GameStatus.LOBBY_WAITING;
      lobby.scenario = null;
      lobby.scenarioImage = undefined;
      lobby.roundResult = undefined;
      lobby.players.forEach(p => {
          p.status = 'waiting';
          p.actionText = undefined;
      });

      this.emitUpdate(code);
  }

  public emitUpdate(code: string) {
    const lobby = this.lobbies.get(code);
    if (lobby) {
        this.io.to(code).emit('game_state', lobby);
    }
  }
}
