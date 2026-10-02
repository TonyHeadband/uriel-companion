export const SOUND_NAMES = [
  "send", "think", "work", "search", "finish", "error", "hover", "poke", "annoyed", "dizzy", "love", "yawn", "greet", "interrupt",
] as const;

export type SoundName = (typeof SOUND_NAMES)[number];
