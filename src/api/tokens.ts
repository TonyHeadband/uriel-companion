import type { AppConfig, Invoke } from "../config";
import type { TokenSource } from "./gateway";

type Auth = AppConfig["auth"];

const ids = (auth: Auth) => ({ issuer: auth.issuer, clientId: auth.client_id });

export function oidcTokens(invoke: Invoke, auth: Auth): TokenSource {
  return {
    async headers(): Promise<Record<string, string>> {
      const token = (await invoke("access_token", ids(auth))) as string | null;
      return token ? { authorization: `Bearer ${token}` } : {};
    },
    refresh: async () => (await invoke("refresh_access_token", ids(auth))) === true,
  };
}

/** Dev only: a service key maps to a fixed principal and bypasses per-person gating. */
export function apiKeyTokens(invoke: Invoke): TokenSource {
  return {
    async headers(): Promise<Record<string, string>> {
      const key = (await invoke("api_key")) as string | null;
      return key ? { "x-api-key": key } : {};
    },
    refresh: async () => false,
  };
}

export async function hasSession(invoke: Invoke, auth: Auth): Promise<boolean> {
  try {
    return (await invoke("access_token", ids(auth))) != null;
  } catch {
    // Offline or the identity server is down: open the app; turns will say they can't reach home.
    return true;
  }
}

export async function signIn(invoke: Invoke, auth: Auth): Promise<void> {
  await invoke("sign_in", { ...ids(auth), redirectPort: auth.redirect_port });
}
