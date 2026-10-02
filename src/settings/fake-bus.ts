import type { Bus } from "./bus";

export function fakeBus() {
  const handlers = new Map<string, (payload: never) => void>();
  const emitted: Array<[string, unknown]> = [];
  const bus: Bus = {
    emit: (event, payload) => void emitted.push([event, payload]),
    listen: async (event, handler) => void handlers.set(event, handler as (payload: never) => void),
  };
  const deliver = (event: string, payload?: unknown) => handlers.get(event)?.(payload as never);
  return { bus, emitted, deliver };
}
