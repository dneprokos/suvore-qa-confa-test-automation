export type CreateGameRequest = {
  name: string;
  genre: string;
  platforms: string[];
  releaseDate: string;
  hasMultiplayer: boolean;
  description: string;
  imageUrl: string;
  rating: number;
};

/**
 * Game as returned by the games API (Mongoose document shape). POST
 * /api/games's 201 and GET /api/games's 200 carry no documented schema
 * (# API Surface Spec Gaps); this shape was confirmed against a live
 * response during exploration for this ticket rather than read from a spec.
 */
export type Game = {
  _id: string;
  name: string;
  genre: string;
  platforms: string[];
  releaseDate: string;
  hasMultiplayer: boolean;
  description?: string;
  imageUrl?: string;
  rating?: number;
};

export type CreateGameResponse = {
  message: string;
  game: Game;
};

export type DeleteGameResponse = {
  message: string;
};

export type GamesPagination = {
  currentPage: number;
  totalPages: number;
  totalGames: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
};

export type ListGamesResponse = {
  games: Game[];
  pagination: GamesPagination;
};

export type GameErrorResponse = {
  message: string;
  errors?: { msg: string; path?: string }[];
};
