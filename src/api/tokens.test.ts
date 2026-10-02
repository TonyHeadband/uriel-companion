import { DEFAULT_CONFIG } from "../config";
import { apiKeyTokens, hasSession, oidcTokens, signIn } from "./tokens";

const auth = DEFAULT_CONFIG.auth;

test("oidc: bearer header when there's a token, none when signed out", async () => {
  const invoke = vi.fn(async () => "tok");
  expect(await oidcTokens(invoke, auth).headers()).toEqual({ authorization: "Bearer tok" });
  expect(invoke).toHaveBeenCalledWith("access_token", { issuer: auth.issuer, clientId: auth.client_id });
  expect(await oidcTokens(vi.fn(async () => null), auth).headers()).toEqual({});
});

test("oidc refresh asks Rust for a new token", async () => {
  const invoke = vi.fn(async () => true);
  expect(await oidcTokens(invoke, auth).refresh()).toBe(true);
  expect(invoke).toHaveBeenCalledWith("refresh_access_token", { issuer: auth.issuer, clientId: auth.client_id });
});

test("api key: x-api-key header and no refresh", async () => {
  const t = apiKeyTokens(vi.fn(async () => "k1"));
  expect(await t.headers()).toEqual({ "x-api-key": "k1" });
  expect(await t.refresh()).toBe(false);
});

test("hasSession: true with a token, false when signed out, true when offline", async () => {
  expect(await hasSession(vi.fn(async () => "tok"), auth)).toBe(true);
  expect(await hasSession(vi.fn(async () => null), auth)).toBe(false);
  // Offline at startup: open the app anyway; turns will show "can't reach home".
  expect(await hasSession(vi.fn(async () => { throw new Error("dns"); }), auth)).toBe(true);
});

test("signIn passes the redirect port", async () => {
  const invoke = vi.fn(async () => undefined);
  await signIn(invoke, { ...auth, redirect_port: 53682 });
  expect(invoke).toHaveBeenCalledWith("sign_in", { issuer: auth.issuer, clientId: auth.client_id, redirectPort: 53682 });
});
