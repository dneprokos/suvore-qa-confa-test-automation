export const Endpoints = {
  auth: {
    login: "/api/auth/login",
  },
  admin: {
    users: "/api/admin/users",
    userById: (id: string) => `/api/admin/users/${id}`,
    stats: "/api/admin/stats",
  },
} as const;
