/** Admin user as returned by GET /api/admin/users (Mongoose document shape). */
export type AdminUser = {
  _id: string;
  email: string;
  role: string;
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;
};

export type ListAdminsResponse = {
  admins: AdminUser[];
};

export type CreateAdminRequest = {
  email: string;
  password: string;
  confirmPassword: string;
};

/** POST /api/admin/users returns `id`, not `_id`, and omits `lastLogin`. */
export type CreateAdminResponse = {
  message: string;
  admin: {
    id: string;
    email: string;
    role: string;
    createdAt: string;
  };
};

export type DeleteAdminResponse = {
  message: string;
};

export type AdminErrorResponse = {
  message: string;
  errors?: { msg: string; path?: string }[];
};
