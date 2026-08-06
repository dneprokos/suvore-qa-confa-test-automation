import { APIRequestContext } from "@playwright/test";
import {
  AdminRequestBuilder,
  CreateAdminApiResult,
  DeleteAdminApiResult,
  ListAdminsApiResult,
} from "@services/api/builders/admin-request-builder";
import {
  CreateAdminRequest,
  ListAdminsResponse,
} from "@services/api/types/admin";

export class AdminApi {
  constructor(private readonly request: APIRequestContext) {}

  /** Entry point for custom requests: headers, partial or malformed bodies. */
  adminBuilder(): AdminRequestBuilder {
    return new AdminRequestBuilder(this.request);
  }

  async listAdmins(token: string): Promise<ListAdminsApiResult> {
    return this.adminBuilder().withBearerToken(token).sendListAdmins();
  }

  async createAdmin(
    token: string,
    payload: CreateAdminRequest,
  ): Promise<CreateAdminApiResult> {
    return this.adminBuilder()
      .withBearerToken(token)
      .withBody(payload)
      .sendCreateAdmin();
  }

  async deleteAdmin(token: string, id: string): Promise<DeleteAdminApiResult> {
    return this.adminBuilder().withBearerToken(token).sendDeleteAdmin(id);
  }

  /** Returns the admin ids matching an e-mail, empty when the admin is gone. */
  async findAdminIdsByEmail(token: string, email: string): Promise<string[]> {
    const result = await this.listAdmins(token);
    const admins = (result.body as ListAdminsResponse)?.admins ?? [];

    return admins.filter((admin) => admin.email === email).map((a) => a._id);
  }
}
