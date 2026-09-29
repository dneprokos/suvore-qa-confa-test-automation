import { Game } from "@services/api/types/games";

/**
 * GET /api/games/{id} 200 body: the game wrapped under `game`. The operation
 * documents no response schema (# API Surface Spec Gaps); this wrapper was
 * confirmed against a live response. `createdBy` is deliberately absent - its
 * shape (populated object or bare id) is an unresolved requirement question.
 */
export type GameDetailResponse = {
  game: Game;
};
