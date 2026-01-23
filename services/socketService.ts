
import { io, Socket } from 'socket.io-client';
import { GameState, LobbySettings, Player, GameStatus } from '../types';

const URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

type GameStateCallback = (state: GameState) => void;

class SocketServiceImpl {
  private socket: Socket | null = null;
  private subscribers: GameStateCallback[] = [];

  public connect() {
    if (this.socket) return;

    const initData = window.Telegram?.WebApp?.initData || '';

    this.socket = io(URL, {
      auth: {
        initData: initData
      },
      transports: ['websocket']
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
        // Could dispatch to UI
    });
  }

  public subscribe(callback: GameStateCallback): () => void {
      this.subscribers.push(callback);
      return () => {
          this.subscribers = this.subscribers.filter(s => s !== callback);
      };
  }

  private notifySubscribers(state: GameState) {
      this.subscribers.forEach(cb => cb(state));
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
              if (response.error) reject(response.error);
              else resolve(response.code!);
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
                  resolve(true);
              }
          });
      });
  }

  public updateSettings(code: string, settings: Partial<LobbySettings>) {
      this.socket?.emit('update_settings', { code, settings });
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
      }
  }
}

export const SocketService = new SocketServiceImpl();
