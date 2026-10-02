import { S } from "../strings";
import { h } from "./dom";

/** The settings window's page shell: Customization and Settings tabs. */
export function settingsPanel(customization: HTMLElement, settings: HTMLElement): HTMLElement {
  const tabs: Array<[HTMLElement, HTMLElement]> = [
    [h("button", { class: "tab", type: "button", role: "tab", text: S.tabCustomization }), customization],
    [h("button", { class: "tab", type: "button", role: "tab", text: S.tabSettings }), settings],
  ];
  const show = (index: number) =>
    tabs.forEach(([tab, body], i) => {
      tab.setAttribute("aria-selected", String(i === index));
      body.hidden = i !== index;
    });
  tabs.forEach(([tab], i) => tab.addEventListener("click", () => show(i)));
  show(0);
  return h(
    "aside",
    { class: "panel" },
    h("div", { class: "panel-hdr" }, h("div", { class: "tabs", role: "tablist" }, ...tabs.map(([t]) => t))),
    h("div", { class: "panel-body" }, customization, settings),
  );
}
