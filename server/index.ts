
import express from 'express';
import path from 'path';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { CONFIG } from './config';
import { LobbyService } from './services/lobbyService';
import { GeminiService } from './services/geminiService';
import { validateTelegramData, TelegramUser } from './utils/telegramAuth';
import { LobbySettings, Player } from '../types';
import { setupProxy } from './utils/proxy';

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
  }
}

// Middleware: Strict Authentication
io.use((socket, next) => {
  const initData = socket.handshake.auth.initData;

  // Development Bypass (Optional, remove for prod, but useful here if CONFIG.BOT_TOKEN is missing)
  if (!CONFIG.BOT_TOKEN && process.env.NODE_ENV !== 'production') {
      console.warn("DEV MODE: Skipping Auth Check due to missing token.");
      socket.telegramUser = { id: 12345, first_name: "Dev", username: "dev" };
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

  socket.on('create_lobby', ({ player, settings }: { player: Player, settings: LobbySettings }, callback) => {
    // Security Check: Ensure the player object ID matches the authenticated user ID
    if (player.id !== user.id.toString()) {
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
    if (player.id !== user.id.toString()) {
        if (callback) callback({ error: "Identity mismatch" });
        return;
    }

    const success = lobbyService.joinLobby(code, player, socket.id);
    if (success) {
        socket.join(code);
        if (callback) callback({ success: true });
    } else {
        if (callback) callback({ error: "Lobby not found or locked" });
    }
  });

  socket.on('update_settings', ({ code, settings }: { code: string, settings: Partial<LobbySettings> }) => {
     if (lobbyService.isCaptain(code, user.id.toString())) {
         lobbyService.updateSettings(code, user.id.toString(), settings);
     }
  });

  socket.on('start_game', ({ code }: { code: string }) => {
      if (lobbyService.isCaptain(code, user.id.toString())) {
          lobbyService.startGame(code, user.id.toString());
      }
  });

  socket.on('submit_action', ({ code, action }: { code: string, action: string }) => {
      lobbyService.submitAction(code, user.id.toString(), action);
  });

  socket.on('reset_game', ({ code }: { code: string }) => {
      if (lobbyService.isCaptain(code, user.id.toString())) {
          lobbyService.resetGame(code, user.id.toString());
      }
  });

  socket.on('disconnect', () => {
    lobbyService.handleDisconnect(user.id.toString(), socket.id);
  });
});

httpServer.listen(CONFIG.PORT, () => {
  console.log(`Server running on port ${CONFIG.PORT}`);
});
