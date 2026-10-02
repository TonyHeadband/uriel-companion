import { S } from "../strings";
import { h } from "./dom";

export function setupScreen(onSave: (url: string) => void, suggested: string): HTMLElement {
  const input = h("input", { class: "field", type: "url", value: suggested, "aria-label": S.setupTitle });
  input.value = suggested;
  const err = h("p", { class: "sub red" });
  const form = h(
    "form",
    { class: "screen" },
    h("h1", { class: "big", text: S.setupTitle }),
    h("p", { class: "sub", text: S.setupHint }),
    input,
    err,
    h("button", { class: "btn primary", type: "submit", text: S.save }),
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let url: URL;
    try {
      url = new URL(input.value.trim());
    } catch {
      err.textContent = S.setupBad;
      return;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      err.textContent = S.setupBad;
      return;
    }
    onSave(url.toString().replace(/\/+$/, ""));
  });
  return form;
}

export function signInScreen(onSignIn: () => Promise<void>): HTMLElement {
  const err = h("p", { class: "sub red" });
  const btn = h("button", { class: "btn primary", type: "button", text: S.signIn });
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    err.textContent = "";
    try {
      await onSignIn();
    } catch {
      err.textContent = S.signInFailed;
    } finally {
      btn.disabled = false;
    }
  });
  return h(
    "div",
    { class: "screen" },
    h("h1", { class: "big", text: S.signInTitle }),
    h("p", { class: "sub", text: S.signInHint }),
    btn,
    err,
  );
}
