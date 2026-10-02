import { h } from "./dom";

/** A collapsible group of controls; the summary is its title. */
export function section(title: string, open: boolean, ...children: Node[]): HTMLDetailsElement {
  return h("details", { class: "sec", open }, h("summary", { text: title }), ...children);
}
