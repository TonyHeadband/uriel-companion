import { emit, listen } from "@tauri-apps/api/event";

/** The two windows' only link; a fake stands in for it in tests. */
export interface Bus {
  emit(event: string, payload?: unknown): void;
  /** Resolves once the handler is registered, so a caller can announce itself without racing its own listener. */
  listen<T>(event: string, handler: (payload: T) => void): Promise<void>;
}

export const tauriBus: Bus = {
  emit: (event, payload) => {
    emit(event, payload).catch((e) => console.warn(`couldn't send ${event}: ${String(e)}`));
  },
  listen: async (event, handler) => {
    await listen(event, (e) => handler(e.payload as never));
  },
};
