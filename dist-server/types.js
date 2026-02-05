"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameStatus = exports.ScenarioType = exports.GameMode = void 0;
var GameMode;
(function (GameMode) {
    GameMode["COOP"] = "coop";
    GameMode["PVP"] = "pvp";
    GameMode["BATTLE_ROYALE"] = "battle_royale";
})(GameMode || (exports.GameMode = GameMode = {}));
var ScenarioType;
(function (ScenarioType) {
    ScenarioType["ANY"] = "any";
    ScenarioType["SCI_FI"] = "sci_fi";
    ScenarioType["SUPERNATURAL"] = "supernatural";
    ScenarioType["APOCALYPSE"] = "apocalypse";
    ScenarioType["FANTASY"] = "fantasy";
    ScenarioType["CYBERPUNK"] = "cyberpunk";
})(ScenarioType || (exports.ScenarioType = ScenarioType = {}));
var GameStatus;
(function (GameStatus) {
    GameStatus["HOME"] = "HOME";
    GameStatus["LOBBY_SETUP"] = "LOBBY_SETUP";
    GameStatus["LOBBY_WAITING"] = "LOBBY_WAITING";
    GameStatus["SCENARIO_GENERATION"] = "SCENARIO_GENERATION";
    GameStatus["PLAYER_INPUT"] = "PLAYER_INPUT";
    GameStatus["JUDGING"] = "JUDGING";
    GameStatus["RESULTS"] = "RESULTS";
})(GameStatus || (exports.GameStatus = GameStatus = {}));
//# sourceMappingURL=types.js.map