import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { CONFIG } from './config';
import { LobbyService } from './services/lobbyService';
import { GeminiService } from './services/geminiService';
import { NavyService } from './services/navyService';
import { validateTelegramData, TelegramUser } from './utils/telegramAuth';
import { LobbySettings, Player } from '../types';
import { setupProxy } from './utils/proxy';
import { cleanupOldFiles } from './utils/fileStorage';

// Initialize proxy for global fetch (required for Gemini SDK behind some proxies)
setupProxy();

const app = express();
app.use(cors());

// Serve static files from the public directory
app.use(express.static(path.join(process.cwd(), 'public')));

// Handle Single Page Application routing (serve index.html for all non-API routes)
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const lobbyService = new LobbyService(io);

// Extend Socket type
declare module 'socket.io' {
    interface Socket {
        telegramUser?: TelegramUser;
        lastNavyCheck?: number; // Rate limiting timestamp
    }
}

// Start Image Cleanup Task (run every 1 hour)
cleanupOldFiles(); // Initial run
setInterval(cleanupOldFiles, 60 * 60 * 1000);

// Middleware: Strict Authentication
io.use((socket, next) => {
    const initData = socket.handshake.auth.initData;

    // Development Bypass (Optional, remove for prod, but useful here if CONFIG.BOT_TOKEN is missing)
    if (!CONFIG.BOT_TOKEN && process.env.NODE_ENV !== 'production') {
        console.warn("DEV MODE: Skipping Auth Check due to missing token.");

        // Use a special DEV flag indicating this socket is fully trusted because we're in dev mode
        socket.telegramUser = { id: 0, first_name: "Dev", username: "dev", isDevBypass: true } as any;
        return next();
    }

    if (!initData) {
        return next(new Error("Authentication failed: No initData provided"));
    }

    const { isValid, user, error } = validateTelegramData(initData);

    if (!isValid || !user) {
        console.error(`Auth Failed: ${error}`);
        return next(new Error("Authentication failed: Invalid Telegram Data"));
    }

    socket.telegramUser = user;
    next();
});

io.on('connection', (socket) => {
    const user = socket.telegramUser!;
    // console.log(`User connected: ${user.id} (${user.first_name})`);

    socket.on('validate_api_key', async ({ apiKey }: { apiKey: string }, callback) => {
        // We can use a service or just call the Gemini service directly
        const isValid = await GeminiService.validateKey(apiKey);
        if (callback) callback({ isValid });
    });

    socket.on('validate_navy_key', async ({ apiKey, code }: { apiKey: string, code?: string }, callback) => {
        if (!callback) return;

        // Input Validation
        if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
            return callback({ usage: null, error: "Invalid API Key format" });
        }

        // Rate Limiting (Simple Token Bucket / Timestamp)
        const now = Date.now();
        const lastCheck = socket.lastNavyCheck || 0;
        if (now - lastCheck < 2000) { // Limit to 1 request every 2 seconds per socket
            return callback({ usage: null, error: "Rate limit exceeded. Please wait." });
        }
        socket.lastNavyCheck = now;

        const usage = await NavyService.getUsage(apiKey);

        if (usage && code && lobbyService.isPlayerInLobby(code, user.id.toString())) {
            lobbyService.updatePlayer(code, user.id.toString(), {
                navyUsage: {
                    tokens: usage.usage.tokens_remaining_today,
                    plan: usage.plan
                }
            });
        }

        callback({ usage });
    });

    socket.on('create_lobby', ({ player, settings }: { player: Player, settings: LobbySettings }, callback) => {
        // Security Check: Ensure the player object ID matches the authenticated user ID
        // Skip in dev mode to allow local multi-client testing
        if (!(user as any).isDevBypass && player.id !== user.id.toString()) {
            if (callback) callback({ error: "Identity mismatch" });
            return;
        }

        try {
            const code = lobbyService.createLobby(player, settings, socket.id);
            socket.join(code);
            lobbyService.emitUpdate(code);
            if (callback) callback({ code });
        } catch (e) {
            if (callback) callback({ error: "Failed to create lobby" });
        }
    });

    socket.on('join_lobby', ({ code, player }: { code: string, player: Player }, callback) => {
        if (!(user as any).isDevBypass && player.id !== user.id.toString()) {
            if (callback) callback({ error: "Identity mismatch" });
            return;
        }

        const success = lobbyService.joinLobby(code, player, socket.id);
        if (success) {
            socket.join(code);
            lobbyService.emitUpdate(code); // Emit update AFTER player has joined the socket room
            if (callback) callback({ success: true });
        } else {
            if (callback) callback({ error: "Lobby not found or locked" });
        }
    });

    socket.on('update_settings', ({ code, settings, playerId }: { code: string, settings: Partial<LobbySettings>, playerId?: string }) => {
        const pid = ((user as any).isDevBypass && playerId) ? playerId : user.id.toString();
        if (lobbyService.isCaptain(code, pid)) {
            lobbyService.updateSettings(code, pid, settings);
        }
    });

    socket.on('update_player', ({ code, updates, playerId }: { code: string, updates: Partial<Player>, playerId?: string }) => {
        // Any player can update their OWN data
        const pid = ((user as any).isDevBypass && playerId) ? playerId : user.id.toString();
        lobbyService.updatePlayer(code, pid, updates);
    });

    // Handle client responding to 'request_keys' event
    socket.on('provide_keys', ({ code, keys, playerId }: { code: string, keys: { gemini?: string, navy?: string }, playerId?: string }) => {
        // Security Check: Ensure user is actually in the lobby
        const pid = ((user as any).isDevBypass && playerId) ? playerId : user.id.toString();
        // DEBUG LOG
        console.log(`[DEV DEBUG] provide_keys from pid: ${pid}, lobby: ${code}. Has Gemini: ${!!keys.gemini}, Has Navy: ${!!keys.navy}`);

        if (lobbyService.isPlayerInLobby(code, pid)) {
            lobbyService.receiveKeys(code, pid, keys);
        } else {
            console.log(`[DEV DEBUG] provide_keys REJECTED - Player ${pid} is not in lobby ${code}.`);
        }
    });

    socket.on('get_aggregate_navy_usage', ({ code, playerId }: { code: string, playerId?: string }) => {
        const pid = ((user as any).isDevBypass && playerId) ? playerId : user.id.toString();
        if (lobbyService.isCaptain(code, pid)) {
            lobbyService.getAggregateNavyUsage(code, pid);
        }
    });

    socket.on('start_game', ({ code, playerId }: { code: string, playerId?: string }) => {
        const pid = ((user as any).isDevBypass && playerId) ? playerId : user.id.toString();
        if (lobbyService.isCaptain(code, pid)) {
            lobbyService.startGame(code, pid);
        }
    });

    socket.on('submit_action', ({ code, action, playerId }: { code: string, action: string, playerId?: string }) => {
        const pid = ((user as any).isDevBypass && playerId) ? playerId : user.id.toString();
        lobbyService.submitAction(code, pid, action);
    });

    socket.on('reveal_results', ({ code, playerId }: { code: string, playerId?: string }) => {
        const pid = ((user as any).isDevBypass && playerId) ? playerId : user.id.toString();
        if (lobbyService.isCaptain(code, pid)) {
            lobbyService.revealResults(code, pid);
        }
    });

    socket.on('reset_game', ({ code, playerId }: { code: string, playerId?: string }) => {
        const pid = ((user as any).isDevBypass && playerId) ? playerId : user.id.toString();
        if (lobbyService.isCaptain(code, pid)) {
            lobbyService.resetGame(code, pid);
        }
    });

    socket.on('next_round', ({ code, playerId }: { code: string, playerId?: string }) => {
        const pid = ((user as any).isDevBypass && playerId) ? playerId : user.id.toString();
        if (lobbyService.isCaptain(code, pid)) {
            lobbyService.nextRound(code, pid);
        }
    });

    socket.on('disconnect', () => {
        lobbyService.handleDisconnect(user.id.toString(), socket.id);
    });
});

httpServer.listen(CONFIG.PORT, () => {
    console.log(`Server running on port ${CONFIG.PORT}`);
});
