"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const path_1 = __importDefault(require("path"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const config_1 = require("./config");
const lobbyService_1 = require("./services/lobbyService");
const geminiService_1 = require("./services/geminiService");
const telegramAuth_1 = require("./utils/telegramAuth");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
// Serve static files from the public directory
app.use(express_1.default.static(path_1.default.join(process.cwd(), 'public')));
// Handle Single Page Application routing (serve index.html for all non-API routes)
app.get('*', (req, res) => {
    res.sendFile(path_1.default.join(process.cwd(), 'public', 'index.html'));
});
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});
const lobbyService = new lobbyService_1.LobbyService(io);
// Middleware: Strict Authentication
io.use((socket, next) => {
    const initData = socket.handshake.auth.initData;
    // Development Bypass (Optional, remove for prod, but useful here if CONFIG.BOT_TOKEN is missing)
    if (!config_1.CONFIG.BOT_TOKEN && process.env.NODE_ENV !== 'production') {
        console.warn("DEV MODE: Skipping Auth Check due to missing token.");
        socket.telegramUser = { id: 12345, first_name: "Dev", username: "dev" };
        return next();
    }
    if (!initData) {
        return next(new Error("Authentication failed: No initData provided"));
    }
    const { isValid, user, error } = (0, telegramAuth_1.validateTelegramData)(initData);
    if (!isValid || !user) {
        console.error(`Auth Failed: ${error}`);
        return next(new Error("Authentication failed: Invalid Telegram Data"));
    }
    socket.telegramUser = user;
    next();
});
io.on('connection', (socket) => {
    const user = socket.telegramUser;
    // console.log(`User connected: ${user.id} (${user.first_name})`);
    socket.on('validate_api_key', async ({ apiKey }, callback) => {
        // We can use a service or just call the Gemini service directly
        const isValid = await geminiService_1.GeminiService.validateKey(apiKey);
        if (callback)
            callback({ isValid });
    });
    socket.on('create_lobby', ({ player, settings }, callback) => {
        // Security Check: Ensure the player object ID matches the authenticated user ID
        if (player.id !== user.id.toString()) {
            if (callback)
                callback({ error: "Identity mismatch" });
            return;
        }
        try {
            const code = lobbyService.createLobby(player, settings);
            socket.join(code);
            lobbyService.emitUpdate(code);
            if (callback)
                callback({ code });
        }
        catch (e) {
            if (callback)
                callback({ error: "Failed to create lobby" });
        }
    });
    socket.on('join_lobby', ({ code, player }, callback) => {
        if (player.id !== user.id.toString()) {
            if (callback)
                callback({ error: "Identity mismatch" });
            return;
        }
        const success = lobbyService.joinLobby(code, player);
        if (success) {
            socket.join(code);
            if (callback)
                callback({ success: true });
        }
        else {
            if (callback)
                callback({ error: "Lobby not found or locked" });
        }
    });
    socket.on('update_settings', ({ code, settings }) => {
        // TODO: Check if user is captain?
        // LobbyService doesn't expose `isCaptain` check easily without fetching state.
        // For now we trust the client, but ideally we should verify host.
        lobbyService.updateSettings(code, settings);
    });
    socket.on('start_game', ({ code }) => {
        lobbyService.startGame(code);
    });
    socket.on('submit_action', ({ code, action }) => {
        lobbyService.submitAction(code, user.id.toString(), action);
    });
    socket.on('reset_game', ({ code }) => {
        lobbyService.resetGame(code);
    });
    socket.on('disconnect', () => {
        // Handle disconnect (optional: mark player as offline?)
    });
});
httpServer.listen(config_1.CONFIG.PORT, () => {
    console.log(`Server running on port ${config_1.CONFIG.PORT}`);
});
//# sourceMappingURL=index.js.map