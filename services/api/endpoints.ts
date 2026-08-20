export const Endpoints = {
  auth: {
    login: "/api/auth/login",
  },
  admin: {
    users: "/api/admin/users",
    userById: (id: string) => `/api/admin/users/${id}`,
    stats: "/api/admin/stats",
  },
  games: {
    list: "/api/games",
    byId: (id: string) => `/api/games/${id}`,
  },
} as const;
