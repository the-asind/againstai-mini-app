import { io, Socket } from 'socket.io-client';
import { GameState, LobbySettings, Player, GameStatus } from '../types';

const URL = import.meta.env.VITE_API_URL || undefined; // undefined = auto-detect host

type GameStateCallback = (state: GameState) => void;
type ErrorCallback = (error: { message: string }) => void;

class SocketServiceImpl {
  private socket: Socket | null = null;
  private subscribers: GameStateCallback[] = [];
  private errorSubscribers: ErrorCallback[] = [];

  // Session State for Reconnection
  private currentLobbyCode: string | null = null;
  private currentPlayer: Player | null = null;

  public connect() {
    if (this.socket) return;

    const initData = window.Telegram?.WebApp?.initData || '';

    this.socket = io(URL, {
      auth: {
        initData: initData
      },
      transports: ['websocket', 'polling'] // Add polling fallback
    });

    this.socket.on('connect', () => {
        // Auto-rejoin if session exists (e.g. after temporary disconnect)
        if (this.currentLobbyCode && this.currentPlayer) {
            console.log("Reconnecting to lobby:", this.currentLobbyCode);
            this.socket?.emit('join_lobby', {
                code: this.currentLobbyCode,
                player: this.currentPlayer
            });
        }
    });

    this.socket.on('connect_error', (err) => {
      console.error("Socket Connection Error:", err.message);
      // Maybe notify UI via a separate subscription or just toast?
    });

    this.socket.on('game_state', (state: GameState) => {
        this.notifySubscribers(state);
    });

    this.socket.on('error', (err: { message: string }) => {
        console.error("Server Error:", err.message);
        this.notifyErrorSubscribers(err);
    });
  }

  public subscribe(callback: GameStateCallback): () => void {
      this.subscribers.push(callback);
      return () => {
          this.subscribers = this.subscribers.filter(s => s !== callback);
      };
  }

  public subscribeToErrors(callback: ErrorCallback): () => void {
      this.errorSubscribers.push(callback);
      return () => {
          this.errorSubscribers = this.errorSubscribers.filter(s => s !== callback);
      };
  }

  private notifySubscribers(state: GameState) {
      this.subscribers.forEach(cb => cb(state));
  }

  private notifyErrorSubscribers(error: { message: string }) {
      this.errorSubscribers.forEach(cb => cb(error));
  }

  public async validateApiKey(apiKey: string): Promise<boolean> {
      this.connect();
      return new Promise((resolve) => {
          this.socket?.emit('validate_api_key', { apiKey }, (response: { isValid: boolean }) => {
              resolve(response.isValid);
          });
      });
  }

  public async createLobby(player: Player, settings: LobbySettings): Promise<string> {
      this.connect(); // Ensure connection
      return new Promise((resolve, reject) => {
          this.socket?.emit('create_lobby', { player, settings }, (response: { code?: string, error?: string }) => {
              if (response.error) {
                  reject(response.error);
              } else {
                  // Save session state
                  this.currentLobbyCode = response.code!;
                  this.currentPlayer = player;
                  resolve(response.code!);
              }
          });
      });
  }

  public async joinLobby(code: string, player: Player): Promise<boolean> {
      this.connect();
      return new Promise((resolve) => {
          this.socket?.emit('join_lobby', { code, player }, (response: { success?: boolean, error?: string }) => {
              if (response.error) {
                  console.error(response.error);
                  resolve(false);
              } else {
                  // Save session state
                  this.currentLobbyCode = code;
                  this.currentPlayer = player;
                  resolve(true);
              }
          });
      });
  }

  public updateSettings(code: string, settings: Partial<LobbySettings>) {
      this.socket?.emit('update_settings', { code, settings });
  }

  public updatePlayer(code: string, updates: Partial<Player>) {
      this.socket?.emit('update_player', { code, updates });

      // Update local session state if name changed
      if (updates.name && this.currentPlayer) {
          this.currentPlayer = { ...this.currentPlayer, name: updates.name };
      }
  }

  public startGame(code: string) {
      this.socket?.emit('start_game', { code });
  }

  public submitAction(code: string, action: string) {
      this.socket?.emit('submit_action', { code, action });
  }

  public resetGame(code: string) {
      this.socket?.emit('reset_game', { code });
  }

  // Method to manually disconnect (e.g. for testing)
  public disconnect() {
      if (this.socket) {
          this.socket.disconnect();
          this.socket = null;
          // Clear session state? Maybe keep it if we want to support manual reconnect later?
          // For now, let's clear it to be safe.
          this.currentLobbyCode = null;
          this.currentPlayer = null;
      }
  }
}

export const SocketService = new SocketServiceImpl();
