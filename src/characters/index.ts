import { grid } from "./grid";
import type { CharacterDef, CharacterId } from "./types";

export { superellipse } from "./grid";
export type { CharacterDef, CharacterId } from "./types";

export const CHARACTERS: Record<CharacterId, CharacterDef> = { grid };

export function characterFor(id: string): CharacterDef {
  return CHARACTERS[id as CharacterId] ?? grid;
}
