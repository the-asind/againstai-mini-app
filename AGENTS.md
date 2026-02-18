# AGENTS.md — AI Context & Guidelines

> **Роль:** Ты — опытный Fullstack разработчик (Node.js + React), работающий над проектом **AgainstAI Mini App**.
> **Цель:** Поддерживать чистоту кода, следовать архитектуре и использовать MCP для получения актуальной документации.

---

## 1. Обзор Проекта (Project Overview)
**AgainstAI Mini App** — это веб-приложение (Telegram Mini App), где игроки взаимодействуют с ИИ Гейм-Мастером (Gemini) в текстовом квесте на выживание.
- **Frontend:** React + Vite + TypeScript.
- **Backend:** Node.js (Express) + WebSocket (Socket.io).
- **AI Core:** Google Gemini API (через `geminiService`).

---

## 2. Архитектура и Ключевые Файлы (Code Map)

### Backend (`/server`)
Здесь находится вся бизнес-логика и управление состоянием игры.

| Файл | Описание и Функции |
|------|-------------------|
| **`server/index.ts`** | Точка входа. Настройка Express сервера и WebSocket соединения. |
| **`server/services/lobbyService.ts`** | **Менеджер состояния игры.** <br> • `createLobby()`: Создает новую комнату.<br> • `joinLobby()`: Добавляет игрока.<br> • `updateGameState()`: Меняет фазы игры (LOBBY -> GAME -> RESULTS).<br> • Хранит состояние всех активных игр в памяти. |
| **`server/services/geminiService.ts`** | **Мозг Гейм-Мастера.** <br> • `generateScenario()`: Генерирует сюжет на основе архетипов.<br> • `evaluateAction()`: Оценивает действия игроков (успех/провал).<br> • Взаимодействует с Google GenAI SDK. |
| **`server/prompts.ts`** | **Промпт-инжиниринг.** Содержит системные инструкции (`SCENARIO_GENERATOR`) и шаблоны для генерации контента. |
| **`server/archetypes/*.ts`** | **Контент.** Списки ролей (`roles.ts`), угроз (`incidents.ts`) и твистов (`twists.ts`) для рандомизации сюжета. |

### Frontend (`/src`)
Клиентская часть для взаимодействия игроков.

| Файл | Описание |
|------|----------|
| **`services/socketService.ts`** | Клиентский слой для WebSocket. Обрабатывает события `game_start`, `new_message`, `player_joined`. |
| **`types.ts`** | Общие TypeScript интерфейсы (`Player`, `Lobby`, `GameState`). Используются и на клиенте, и на сервере. |

---

## 3. Работа с Model Context Protocol (MCP)

Мы используем MCP для подключения ИИ к актуальным знаниям и инструментам.

### **КОГДА использовать MCP (When to use):**
1. **Неизвестные библиотеки:** Если ты не уверен в синтаксисе свежей версии библиотеки (например, новой версии Gemini SDK или Socket.io).
2. **Внешние API:** Когда нужно проверить актуальные лимиты или методы API Google/Telegram.
3. **Отладка:** Когда стандартные решения не работают, и нужно найти свежее решение из документации.

### **КАК использовать MCP (How to use):**

#### A. Получение документации (`Context7`)
Для доступа к **свежей документации** библиотек используй сервер `context7`.
* **Команда:** Добавь фразу `"use context7"` или `"check docs via context7"` в свой промпт.
* **Пример:** *"Как использовать streaming в Google GenAI SDK? Use context7 to check the latest docs."*
* **Ссылка:** [Context7 Tips](https://context7.com/docs/tips)

#### B. Интеграция инструментов (`Google Stitch`)
Для сложных интеграций и настройки окружения используй подходы Google Stitch.
* Если нужно создать новый инструмент или подключить API, сверься с гайдом по настройке MCP.
* **Ссылка:** [Stitch MCP Setup](https://stitch.withgoogle.com/docs/mcp/setup)

---

## 4. Правила Кодинга (Conventions)

1.  **Strict TypeScript:** Всегда используй строгую типизацию. Никаких `any`. Если тип общий — выноси его в `types.ts`.
2.  **AI Response JSON:** В `geminiService` всегда форсируй JSON-ответ от модели (`responseMimeType: "application/json"`), чтобы избежать ошибок парсинга.
3.  **Обработка ошибок:** Все вызовы к Gemini API должны быть обернуты в `try/catch` с фоллбэком (запасным вариантом текста), чтобы игра не крашилась при сбое API.
4.  **Асинхронность:** Все операции с базой или ИИ должны быть асинхронными (`async/await`).

---

## 5. Сценарии Тестирования (Common Tasks)

* **Добавление нового жанра:**
    1. Добавь ключ в `types.ts`.
    2. Обнови `server/prompts.ts` (или создай новый файл архетипов).
    3. Проверь генерацию через `geminiService`.
* **Изменение логики лобби:**
    1. Правь `lobbyService.ts`.
    2. Убедись, что события сокетов в `index.ts` и `socketService.ts` синхронизированы.