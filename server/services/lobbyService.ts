import { Server } from 'socket.io';
import { GameState, GameStatus, LobbySettings, Player, ImageGenerationMode, ScenarioType, GameMode, RoundResult, Language, AIModelLevel, ScenarioResponse } from '../../types';
import { GeminiService } from './geminiService';
import { ImageService } from './imageService';
import { VoiceService } from './voiceService';
import { NavyService } from './navyService';
import { KeyManager } from '../utils/keyManager';
import { saveImage } from '../utils/fileStorage';
import { CONFIG } from '../config';
import { ABSTRACT_TWISTS } from '../archetypes/twists';

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
    playerSecrets?: Record<string, string>; // Map<playerId, secretText>
}

export class LobbyService {
    private lobbies: Map<string, Lobby> = new Map();
    private io: Server;
    private keyCollectors: Map<string, Map<string, { gemini?: string, navy?: string }>> = new Map();
    private timers: Map<string, NodeJS.Timeout> = new Map();

    // Socket Tracking (Basic implementation for online status)
    private playerSockets: Map<string, Set<string>> = new Map();

    constructor(io: Server) {
        this.io = io;
    }

    // --- Helper Methods ---
    private generateCode(): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let code = '';
        for (let i = 0; i < 6; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    public isCaptain(code: string, playerId: string): boolean {
        const lobby = this.lobbies.get(code);
        if (!lobby) return false;
        const player = lobby.players.find(p => p.id === playerId);
        return !!player && player.isCaptain;
    }

    public isPlayerInLobby(code: string, playerId: string): boolean {
        const lobby = this.lobbies.get(code);
        if (!lobby) return false;
        return lobby.players.some(p => p.id === playerId);
    }
    // ----------------------

    public createLobby(player: Player, settings: LobbySettings, socketId: string): string {
        const code = this.generateCode();

        // Ensure creator is captain
        player.isCaptain = true;
        player.status = 'waiting';
        player.isOnline = true; // Initially online

        this.lobbies.set(code, {
            lobbyCode: code,
            players: [player],
            status: GameStatus.LOBBY_WAITING,
            settings: settings,
            scenario: null,
            geminiKeys: [],
            navyKeys: [],
            resultsRevealed: false
        });

        this.trackSocket(player.id, socketId);
        return code;
    }

    public joinLobby(code: string, player: Player, socketId: string): boolean {
        const lobby = this.lobbies.get(code);
        if (!lobby) return false;

        if (lobby.status !== GameStatus.LOBBY_WAITING && lobby.status !== GameStatus.LOBBY_SETUP) {
            // Allow rejoin if player exists
            const existing = lobby.players.find(p => p.id === player.id);
            if (existing) {
                existing.isOnline = true;
                this.trackSocket(player.id, socketId);
                // emitUpdate deferred to server/index.ts
                return true;
            }
            return false;
        }

        const existingPlayer = lobby.players.find(p => p.id === player.id);
        if (existingPlayer) {
            existingPlayer.name = player.name; // Update name
            existingPlayer.avatarUrl = player.avatarUrl;
            existingPlayer.isOnline = true;
        } else {
            player.isCaptain = false;
            player.status = 'waiting';
            player.isOnline = true;
            lobby.players.push(player);
        }

        this.trackSocket(player.id, socketId);
        // emitUpdate deferred to server/index.ts
        return true;
    }

    private trackSocket(playerId: string, socketId: string) {
        if (!this.playerSockets.has(playerId)) {
            this.playerSockets.set(playerId, new Set());
        }
        this.playerSockets.get(playerId)!.add(socketId);
    }

    public handleDisconnect(playerId: string, socketId: string) {
        const sockets = this.playerSockets.get(playerId);
        if (sockets) {
            sockets.delete(socketId);
            if (sockets.size === 0) {
                // Mark offline in all lobbies
                this.lobbies.forEach(lobby => {
                    const p = lobby.players.find(pl => pl.id === playerId);
                    if (p) {
                        p.isOnline = false;
                        this.emitUpdate(lobby.lobbyCode);
                    }
                });
            }
        }
    }

    public updateSettings(code: string, playerId: string, settings: Partial<LobbySettings>) {
        if (!this.isCaptain(code, playerId)) return;
        const lobby = this.lobbies.get(code);
        if (lobby) {
            lobby.settings = { ...lobby.settings, ...settings };
            this.emitUpdate(code);
        }
    }

    public updatePlayer(code: string, playerId: string, updates: Partial<Player>) {
        const lobby = this.lobbies.get(code);
        if (!lobby) return;

        const player = lobby.players.find(p => p.id === playerId);
        if (player) {
            // Allow keyCount update specifically
            if (updates.keyCount !== undefined) {
                player.keyCount = updates.keyCount;
            }
            if ('loadingVote' in updates) {
                player.loadingVote = updates.loadingVote;
            }
            // Only allow updating self-identification fields if needed,
            // but mainly we track keyCount here from client reports.
            this.emitUpdate(code);
        }
    }

    public receiveKeys(code: string, playerId: string, keys: { gemini?: string, navy?: string }) {
        if (!this.keyCollectors.has(code)) return;

        const collector = this.keyCollectors.get(code)!;
        collector.set(playerId, keys);
        // We don't emit update here to avoid spam/leaks,
        // the collectKeys promise will resolve when ready.
    }

    private async collectKeys(code: string): Promise<void> {
        const lobby = this.lobbies.get(code);
        if (!lobby) return;

        this.keyCollectors.set(code, new Map());

        // Request keys from all online players
        this.io.to(code).emit('request_keys');

        // Wait for keys (max 5 seconds or until all online players respond)
        const onlinePlayers = lobby.players.filter(p => p.isOnline).length;

        await new Promise<void>(resolve => {
            let resolved = false;
            const timeout = setTimeout(() => {
                resolved = true;
                resolve();
            }, 5000);

            // Check periodically or use event emitter.
            // For simple, we'll just poll every 100ms.
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

    // --- Aggregate Stats Feature ---
    public async getAggregateNavyUsage(code: string, playerId: string) {
        if (!this.isCaptain(code, playerId)) return;
        const lobby = this.lobbies.get(code);
        if (!lobby) return;

        // Prevent race condition: if keys are already being collected (e.g. game start), abort stats check.
        if (this.keyCollectors.has(code)) {
            console.warn(`[LobbyService] Stats check aborted for lobby ${code} - collection already in progress.`);
            const socketId = this.playerSockets.get(playerId)?.values().next().value;
            if (socketId) this.io.to(socketId).emit('navy_aggregate_stats', { totalTokens: 0, contributors: 0 }); // Or emit error? For now, return 0/0 is safer than breaking UI.
            return;
        }

        // Reuse collectKeys mechanism to get all current keys
        this.keyCollectors.set(code, new Map());

        // Request keys from all online players
        this.io.to(code).emit('request_keys');

        // Wait for keys (max 3 seconds for stats check)
        const onlinePlayers = lobby.players.filter(p => p.isOnline).length;

        await new Promise<void>(resolve => {
            let resolved = false;
            const timeout = setTimeout(() => {
                resolved = true;
                resolve();
            }, 3000);

            const interval = setInterval(() => {
                if (resolved) {
                    clearInterval(interval);
                    return;
                }
                // Race check: if map was deleted (e.g. by another concurrent process finishing?), stop.
                if (!this.keyCollectors.has(code)) {
                    resolved = true;
                    clearTimeout(timeout);
                    clearInterval(interval);
                    resolve();
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

        if (!collectedMap || collectedMap.size === 0) {
            const socketId = this.playerSockets.get(playerId)?.values().next().value;
            if (socketId) this.io.to(socketId).emit('navy_aggregate_stats', { totalTokens: 0, contributors: 0 });
            return;
        }

        const uniqueNavyKeys = new Set<string>();

        collectedMap.forEach((keys) => {
            if (keys.navy && keys.navy.length > 10) {
                uniqueNavyKeys.add(keys.navy);
            }
        });

        let totalTokens = 0;
        let contributors = 0;

        // Validate each unique key and sum up
        const validations = Array.from(uniqueNavyKeys).map(async (key) => {
            const usage = await NavyService.getUsage(key);
            if (usage) {
                return usage.usage.tokens_remaining_today;
            }
            return 0;
        });

        const results = await Promise.all(validations);
        totalTokens = results.reduce((acc, curr) => acc + curr, 0);
        contributors = results.filter(t => t > 0).length;

        // Emit back to captain only
        const captainSocketId = this.playerSockets.get(playerId)?.values().next().value;
        if (captainSocketId) {
            this.io.to(captainSocketId).emit('navy_aggregate_stats', { totalTokens, contributors });
        }
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

            const scenarioResponse = await GeminiService.generateScenario(
                keyManager,
                lobby.settings.mode,
                lobby.settings.scenarioType,
                lobby.players,
                lang,
                lobby.settings.aiModelLevel
            );

            lobby.scenario = scenarioResponse;

            // Image Generation (SCENARIO)
            if (lobby.settings.imageGenerationMode !== ImageGenerationMode.NONE) {
                try {
                    // Check if we have Navy keys for image generation
                    if (lobby.navyKeys.length > 0) {
                        const navyKeyManager: KeyManager = new KeyManager(lobby.navyKeys[0], lobby.navyKeys.slice(1));
                        const prompt = `create image рассказа ниже. Изображай игроков в ситуации в виде чёрных силуэтов. Стиль реализма, кадр снят от лица "наблюдателя" откуда-то сверху, создавая эффект "подглядывания" за героями. Картика показывает всю "красоту" помещения и располагает к себе внимание завораживая. Все элементы хитро переплетены на холсте:\n${scenarioResponse.scenario_text}`;

                        const base64 = await ImageService.generateImage(navyKeyManager, prompt);
                        if (base64) {
                            const url = await saveImage(base64);
                            lobby.scenarioImage = url;
                        }
                    } else {
                        console.warn("Image generation requested but no Navy keys available.");
                        // Optional: fallback to Gemini Image or notify?
                        // Requirement says "replace creation via Gemini", so no fallback to Gemini Image.
                    }
                } catch (e) {
                    console.error("Scenario Image Gen Failed:", e);
                }
            }

            // Voice Generation (SCENARIO)
            if (lobby.settings.voiceoverScenario) {
                if (lobby.navyKeys.length > 0) {
                    const navyKeyManager = new KeyManager(lobby.navyKeys[0], lobby.navyKeys.slice(1));
                    const voiceUrl = await VoiceService.generateVoice(navyKeyManager, scenarioResponse.scenario_text);
                    if (voiceUrl) {
                        lobby.scenarioAudio = voiceUrl;
                    }
                } else {
                    console.warn("Scenario Voice requested but no Navy keys available.");
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

    // --- Send Private Secrets ---
    private emitSecrets(code: string) {
        const lobby = this.lobbies.get(code);
        if (!lobby || !lobby.playerSecrets) return;

        lobby.players.forEach(p => {
            const secret = lobby.playerSecrets![p.id];
            if (secret) {
                const sockets = this.playerSockets.get(p.id);
                if (sockets) {
                    sockets.forEach(socketId => {
                        this.io.to(socketId).emit('secret_data', { secret });
                    });
                }
            }
        });
    }
    // ----------------------------

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

        // CHEAT_DETECTOR is disabled: we no longer check for injection.

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
                lobby.playerSecrets, // Pass secrets to judge
                lang,
                lobby.settings.aiModelLevel
            );

            // --- SECRET DATA GENERATION ---
            const twistChance = 0.2; // 20% Chance for Twist
            const hasTwist = Math.random() < twistChance;
            let twistType = "NONE";
            let chosenPlayerId: string | null = null;

            if (hasTwist && lobby.players.length > 0) {
                // Pick a random player for the twist
                const randomPlayer = lobby.players[Math.floor(Math.random() * lobby.players.length)];
                chosenPlayerId = randomPlayer.id;

                // Pick a random twist type from available twists (excluding NONE)
                const availableTwists = ABSTRACT_TWISTS.filter(t => t !== "NONE");
                if (availableTwists.length > 0) {
                    twistType = availableTwists[Math.floor(Math.random() * availableTwists.length)];
                } else {
                    twistType = "TRAITOR"; // Fallback
                }
            }

            try {
                const secrets = await GeminiService.generateSecrets(
                    keyManager,
                    safeScenario,
                    lobby.players,
                    lang,
                    lobby.settings.aiModelLevel,
                    twistType,
                    chosenPlayerId
                );

                lobby.playerSecrets = secrets;

                // Emit secrets to players INDIVIDUALLY
                this.emitSecrets(code);

            } catch (e) {
                console.error("Failed to generate secrets:", e);
                // Non-critical, continue without secrets
            }
            // ------------------------------

            // Image Generation (RESULTS)
            if (lobby.settings.imageGenerationMode === ImageGenerationMode.FULL) {
                try {
                    if (lobby.navyKeys.length > 0) {
                        const navyKeyManager: KeyManager = new KeyManager(lobby.navyKeys[0], lobby.navyKeys.slice(1));
                        const prompt = `create image рассказа о происшествии ниже. Изображай игроков в ситуации в виде чёрных силуэтов. Реалистичный стиль. Кадр как из экшн-боевика, показывает живность действий героев — их поступки из рассказа. Каждый герой в активной фазе своего действия крупным планом. В итоге собирается коллаж из всех или самых ключевых героев, как в комиксе:\n${result.story}`;

                        const base64 = await ImageService.generateImage(navyKeyManager, prompt);
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
                if (lobby.navyKeys.length > 0) {
                    const navyKeyManager = new KeyManager(lobby.navyKeys[0], lobby.navyKeys.slice(1));
                    const voiceUrl = await VoiceService.generateVoice(navyKeyManager, result.story);
                    if (voiceUrl) {
                        result.audio = voiceUrl;
                    }
                } else {
                    console.warn("Result Voice requested but no Navy keys available.");
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
        lobby.scenarioAudio = undefined;
        lobby.roundResult = undefined;
        lobby.geminiKeys = [];
        lobby.navyKeys = [];
        lobby.playerSecrets = undefined; // Clear secrets

        lobby.resultsRevealed = false;
        lobby.players.forEach(p => {
            p.status = 'waiting';
            p.actionText = undefined;
            p.loadingVote = null;
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
