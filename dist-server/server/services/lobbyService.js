"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LobbyService = void 0;
const types_1 = require("../../types");
const geminiService_1 = require("./geminiService");
const LOBBY_CODE_LENGTH = 6;
const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
class LobbyService {
    constructor(io) {
        this.lobbies = new Map();
        this.timers = new Map();
        this.io = io;
    }
    generateCode() {
        let result = '';
        for (let i = 0; i < LOBBY_CODE_LENGTH; i++) {
            result += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
        }
        // Recursively ensure uniqueness (though collision prob is low)
        if (this.lobbies.has(result))
            return this.generateCode();
        return result;
    }
    createLobby(host, settings) {
        const code = this.generateCode();
        const initialState = {
            lobbyCode: code,
            players: [{ ...host, isCaptain: true, status: 'waiting' }],
            status: types_1.GameStatus.LOBBY_WAITING,
            settings: settings,
            scenario: null
        };
        this.lobbies.set(code, initialState);
        return code;
    }
    joinLobby(code, player) {
        const lobby = this.lobbies.get(code);
        if (!lobby)
            return false;
        // Reconnect logic: if player ID exists, update socket/status?
        // For now, assume simple join. If ID matches, we update name/ref.
        const existingIndex = lobby.players.findIndex(p => p.id === player.id);
        if (existingIndex !== -1) {
            lobby.players[existingIndex] = { ...lobby.players[existingIndex], name: player.name };
        }
        else {
            if (lobby.status !== types_1.GameStatus.LOBBY_WAITING && lobby.status !== types_1.GameStatus.LOBBY_SETUP) {
                // Can't join mid-game (unless we want to support spectators?)
                return false;
            }
            lobby.players.push({ ...player, isCaptain: false, status: 'waiting' });
        }
        this.emitUpdate(code);
        return true;
    }
    updateSettings(code, settings) {
        const lobby = this.lobbies.get(code);
        if (!lobby)
            return;
        lobby.settings = { ...lobby.settings, ...settings };
        this.emitUpdate(code);
    }
    async startGame(code) {
        const lobby = this.lobbies.get(code);
        if (!lobby)
            return;
        lobby.status = types_1.GameStatus.SCENARIO_GENERATION;
        this.emitUpdate(code);
        try {
            const scenario = await geminiService_1.GeminiService.generateScenario(lobby.settings.apiKey, lobby.settings.mode, lobby.settings.scenarioType, lobby.settings.storyLanguage);
            lobby.scenario = scenario;
            this.startRound(code);
        }
        catch (e) {
            console.error(`Lobby ${code} Start Error:`, e);
            // Revert to waiting or show error
            lobby.status = types_1.GameStatus.LOBBY_WAITING;
            this.io.to(code).emit('error', { message: "Failed to generate scenario. Check API Key." });
            this.emitUpdate(code);
        }
    }
    startRound(code) {
        const lobby = this.lobbies.get(code);
        if (!lobby)
            return;
        lobby.status = types_1.GameStatus.PLAYER_INPUT;
        // Reset player statuses
        lobby.players.forEach(p => {
            p.status = 'waiting';
            p.actionText = undefined;
        });
        this.emitUpdate(code);
        // Start Timer
        const timeLimitMs = (lobby.settings.timeLimitSeconds || 120) * 1000;
        // Clear existing timer if any
        if (this.timers.has(code))
            clearTimeout(this.timers.get(code));
        const timer = setTimeout(() => {
            this.handleTimeout(code);
        }, timeLimitMs);
        this.timers.set(code, timer);
    }
    async submitAction(code, playerId, action) {
        const lobby = this.lobbies.get(code);
        if (!lobby || lobby.status !== types_1.GameStatus.PLAYER_INPUT)
            return;
        const player = lobby.players.find(p => p.id === playerId);
        if (!player)
            return;
        // Check injection immediately? Or wait for batch?
        // Description says "After all submitted OR timer ends... fast model checks".
        // So we just store it for now.
        // However, to give immediate feedback to user like "Action Accepted", we just store it.
        player.actionText = action;
        player.status = 'ready';
        this.emitUpdate(code);
        // Check if all ready
        const allReady = lobby.players.every(p => p.status === 'ready' || p.status === 'dead'); // Dead players don't act?
        // Wait, in new round, dead players might be out.
        // If we support elimination, we should filter `status === 'alive'`?
        // Current types: status: 'alive' | 'dead' | 'waiting' | 'ready'.
        // Logic: Only 'waiting' players need to submit.
        const waitingSurvivors = lobby.players.filter(p => p.status === 'waiting');
        if (waitingSurvivors.length === 0) {
            // All done
            this.resolveRound(code);
        }
    }
    handleTimeout(code) {
        const lobby = this.lobbies.get(code);
        if (!lobby)
            return;
        // Force submit for anyone waiting
        lobby.players.forEach(p => {
            if (p.status === 'waiting') {
                p.actionText = p.actionText || "Frozen in fear, doing nothing.";
                p.status = 'ready';
            }
        });
        this.resolveRound(code);
    }
    async resolveRound(code) {
        const lobby = this.lobbies.get(code);
        if (!lobby)
            return;
        if (this.timers.has(code)) {
            clearTimeout(this.timers.get(code));
            this.timers.delete(code);
        }
        lobby.status = types_1.GameStatus.JUDGING;
        this.emitUpdate(code);
        try {
            // 1. Check for Cheating (Parallel)
            const cheatChecks = await Promise.all(lobby.players.map(async (p) => {
                if (!p.actionText)
                    return { id: p.id, isCheat: false };
                const check = await geminiService_1.GeminiService.checkInjection(lobby.settings.apiKey, p.actionText);
                return { id: p.id, ...check };
            }));
            // 2. Annotate Actions
            cheatChecks.forEach(check => {
                if (check.isCheat) {
                    const p = lobby.players.find(pl => pl.id === check.id);
                    if (p) {
                        p.actionText = `[ATTEMPTED CHEAT: ${check.reason}] ${p.actionText}`;
                    }
                }
            });
            // 3. Judge
            const result = await geminiService_1.GeminiService.judgeRound(lobby.settings.apiKey, lobby.scenario || "Unknown Scenario", lobby.players, lobby.settings.mode, lobby.settings.storyLanguage);
            // 4. Apply Results
            lobby.roundResult = result;
            lobby.status = types_1.GameStatus.RESULTS;
            // Update alive/dead status
            lobby.players.forEach(p => {
                if (result.survivors.includes(p.id)) {
                    p.status = 'alive'; // Or 'ready' -> 'alive'?
                    // In next round they go back to waiting.
                    // For results screen, 'alive' is good.
                }
                else {
                    p.status = 'dead';
                }
            });
            this.emitUpdate(code);
        }
        catch (e) {
            console.error(`Lobby ${code} Judge Error:`, e);
            lobby.status = types_1.GameStatus.PLAYER_INPUT; // Revert? Or fail?
            this.io.to(code).emit('error', { message: "Judging failed." });
            this.emitUpdate(code);
        }
    }
    resetGame(code) {
        const lobby = this.lobbies.get(code);
        if (!lobby)
            return;
        lobby.status = types_1.GameStatus.LOBBY_WAITING;
        lobby.scenario = null;
        lobby.roundResult = undefined;
        lobby.players.forEach(p => {
            p.status = 'waiting';
            p.actionText = undefined;
        });
        this.emitUpdate(code);
    }
    emitUpdate(code) {
        const lobby = this.lobbies.get(code);
        if (lobby) {
            this.io.to(code).emit('game_state', lobby);
        }
    }
}
exports.LobbyService = LobbyService;
//# sourceMappingURL=lobbyService.js.map