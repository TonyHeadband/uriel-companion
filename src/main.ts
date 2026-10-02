import { invoke } from "@tauri-apps/api/core";
import "./style.css";
import { apiKeyTokens, hasSession, oidcTokens, signIn } from "./api/tokens";
import { startApp } from "./app";
import { loadConfig, saveConfig } from "./config";
import { SUGGESTED_GATEWAY } from "./strings";
import { setupScreen, signInScreen } from "./ui/screens";

async function boot(): Promise<void> {
  const root = document.getElementById("app")!;
  const config = await loadConfig(invoke);
  if (!config.gateway_url) {
    root.replaceChildren(
      setupScreen(async (url) => {
        await saveConfig(invoke, { ...config, gateway_url: url });
        location.reload();
      }, SUGGESTED_GATEWAY),
    );
    return;
  }
  const doSignIn = async () => {
    await signIn(invoke, config.auth);
    location.reload();
  };
  if (config.auth.mode === "oidc" && !(await hasSession(invoke, config.auth))) {
    root.replaceChildren(signInScreen(doSignIn));
    return;
  }
  const tokens = config.auth.mode === "api_key" ? apiKeyTokens(invoke) : oidcTokens(invoke, config.auth);
  startApp(root, config, invoke, tokens, () => void doSignIn());
}

void boot();
