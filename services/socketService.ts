import { io, Socket } from 'socket.io-client';
import { GameState, LobbySettings, Player, GameStatus, NavyUsageResponse } from '../types';
import { STORAGE_KEYS } from '../constants';

const URL = import.meta.env.VITE_API_URL || undefined; // undefined = auto-detect host

type GameStateCallback = (state: GameState) => void;
type ErrorCallback = (error: { message: string }) => void;
type NavyAggregateCallback = (data: { totalTokens: number, contributors: number }) => void;
type SecretCallback = (data: { secret: string }) => void;

class SocketServiceImpl {
  private socket: Socket | null = null;
  private subscribers: GameStateCallback[] = [];
  private errorSubscribers: ErrorCallback[] = [];
  private navyAggregateSubscribers: NavyAggregateCallback[] = [];
  private secretSubscribers: SecretCallback[] = [];

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
    });

    this.socket.on('game_state', (state: GameState) => {
        this.notifySubscribers(state);
    });

    this.socket.on('error', (err: { message: string }) => {
        console.error("Server Error:", err.message);
        this.notifyErrorSubscribers(err);
    });

    // Handle key request from server
    this.socket.on('request_keys', () => {
        const gemini = localStorage.getItem(STORAGE_KEYS.API_KEY) || undefined;
        const navy = localStorage.getItem(STORAGE_KEYS.NAVY_KEY) || undefined;

        if (this.currentLobbyCode) {
            this.socket?.emit('provide_keys', {
                code: this.currentLobbyCode,
                keys: { gemini, navy }
            });
        }
    });

    this.socket.on('navy_aggregate_stats', (data: { totalTokens: number, contributors: number }) => {
        this.notifyNavyAggregateSubscribers(data);
    });

    this.socket.on('secret_data', (data: { secret: string }) => {
        this.notifySecretSubscribers(data);
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

  public subscribeToNavyAggregate(callback: NavyAggregateCallback): () => void {
      this.navyAggregateSubscribers.push(callback);
      return () => {
          this.navyAggregateSubscribers = this.navyAggregateSubscribers.filter(s => s !== callback);
      };
  }

  public subscribeToSecretData(callback: SecretCallback): () => void {
      this.secretSubscribers.push(callback);
      return () => {
          this.secretSubscribers = this.secretSubscribers.filter(s => s !== callback);
      };
  }

  public isConnected(): boolean {
      return this.socket?.connected || false;
  }

  public async validateApiKey(apiKey: string): Promise<boolean> {
      this.connect();
      return new Promise((resolve) => {
          this.socket?.emit('validate_api_key', { apiKey }, (response: { isValid: boolean }) => {
              resolve(response.isValid);
          });
      });
  }

  public async validateNavyApiKey(apiKey: string, code?: string): Promise<NavyUsageResponse | null> {
      this.connect();
      return new Promise((resolve) => {
          // If code is not provided but we have a session code, use it.
          const lobbyCode = code || this.currentLobbyCode || undefined;

          this.socket?.emit('validate_navy_key', { apiKey, code: lobbyCode }, (response: { usage: NavyUsageResponse | null }) => {
              resolve(response.usage);
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

      // Update local session state
      if (this.currentPlayer) {
          this.currentPlayer = { ...this.currentPlayer, ...updates };
      }
  }

  public getAggregateNavyUsage(code: string) {
      this.socket?.emit('get_aggregate_navy_usage', { code });
  }

  public startGame(code: string) {
      this.socket?.emit('start_game', { code });
  }

  public submitAction(code: string, action: string) {
      this.socket?.emit('submit_action', { code, action });
  }

  public revealResults(code: string) {
      this.socket?.emit('reveal_results', { code });
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

  private notifySubscribers(state: GameState) {
      this.subscribers.forEach(callback => callback(state));
  }

  private notifyErrorSubscribers(error: { message: string }) {
      this.errorSubscribers.forEach(callback => callback(error));
  }

  private notifyNavyAggregateSubscribers(data: { totalTokens: number, contributors: number }) {
      this.navyAggregateSubscribers.forEach(callback => callback(data));
  }

  private notifySecretSubscribers(data: { secret: string }) {
      this.secretSubscribers.forEach(callback => callback(data));
  }
}

export const SocketService = new SocketServiceImpl();
