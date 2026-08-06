import { APIResponse } from "@playwright/test";

export type ApiResult<TBody> = {
  response: APIResponse;
  status: number;
  ok: boolean;
  body: TBody;
};

/**
 * Builds an ApiResult without assuming the response carries a JSON body.
 * An empty body becomes `undefined`, a non-JSON body is kept as raw text,
 * so negative tests assert on the status instead of failing on a parse error.
 */
export async function toApiResult<TBody>(
  response: APIResponse,
): Promise<ApiResult<TBody>> {
  const text = await response.text();

  let body: TBody;
  try {
    body = text ? (JSON.parse(text) as TBody) : (undefined as TBody);
  } catch {
    body = text as unknown as TBody;
  }

  return {
    response,
    status: response.status(),
    ok: response.ok(),
    body,
  };
}
