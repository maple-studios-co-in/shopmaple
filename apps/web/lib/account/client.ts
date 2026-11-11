import {
  accountProfileResponseSchema,
  addressListResponseSchema,
  addressMutationResponseSchema,
  signInVerifyResponseSchema,
  type AccountProfileUpdate,
  type AddressInput,
  type AddressUpdate,
  type SignInPurpose,
} from "@shopmaple/contracts/account";
import type { z } from "zod";

/** A refused or failed account request. `code` is the API's (CODE_INVALID, ADDRESS_LIMIT, ACCOUNT_AUTH_REQUIRED…), or
 * NETWORK when no answer came and BAD_RESPONSE when the answer could not be read. */
export class AccountRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
  ) {
    super(code);
    this.name = "AccountRequestError";
  }
}

/**
 * The browser's client for the account API's writes; the pages read on the server. Calls go through the site's own /api
 * rewrite, so the browser sends the session cookie and the Origin header the API checks on every write.
 */
export function createAccountClient(transport: typeof fetch = (...args) => fetch(...args)) {
  async function send<T>(method: string, path: string, body: unknown, schema: z.ZodType<T> | null): Promise<T> {
    let response: Response;
    try {
      response = await transport("/api/account" + path, {
        method,
        cache: "no-store",
        credentials: "same-origin",
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new AccountRequestError("NETWORK", 0);
    }
    if (!response.ok) {
      let code = response.status >= 500 ? "SERVER_ERROR" : "REQUEST_FAILED";
      try {
        const json: unknown = await response.json();
        if (json && typeof json === "object" && "code" in json && typeof json.code === "string") code = json.code.slice(0, 64);
      } catch {
        /* A body that is not JSON keeps the status's code. */
      }
      throw new AccountRequestError(code, response.status);
    }
    if (!schema) return undefined as T;
    try {
      return schema.parse(await response.json());
    } catch {
      throw new AccountRequestError("BAD_RESPONSE", response.status);
    }
  }
  return {
    /** Always answered alike (202), whether or not a code was sent: the page says the same either way. `purpose` only
     * changes the email's wording (sign-up, password reset). */
    startSignIn: (email: string, purpose?: SignInPurpose) =>
      send<void>("POST", "/sign-in/start", purpose ? { email, purpose } : { email }, null),
    /** The emailed code; with `password` (sign-up, reset) the proven account takes it, with `name` it is named. */
    verifySignIn: async (email: string, code: string, extra: { password?: string; name?: string } = {}) =>
      (await send("POST", "/sign-in/verify", { email, code, ...extra }, signInVerifyResponseSchema)).customer,
    /** Email and password (Figma 392:1652). */
    passwordSignIn: async (email: string, password: string) =>
      (await send("POST", "/sign-in/password", { email, password }, signInVerifyResponseSchema)).customer,
    signOut: () => send<void>("POST", "/sign-out", {}, null),
    updateProfile: async (update: AccountProfileUpdate) => (await send("PATCH", "", update, accountProfileResponseSchema)).customer,
    addAddress: (input: AddressInput) => send("POST", "/addresses", input, addressMutationResponseSchema),
    updateAddress: (id: string, update: AddressUpdate) => send("PATCH", `/addresses/${encodeURIComponent(id)}`, update, addressMutationResponseSchema),
    deleteAddress: async (id: string) => (await send("DELETE", `/addresses/${encodeURIComponent(id)}`, undefined, addressListResponseSchema)).addresses,
  };
}
export type AccountClient = ReturnType<typeof createAccountClient>;
