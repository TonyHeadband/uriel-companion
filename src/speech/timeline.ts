/** Mouth shapes. `C` is any consonant without its own shape; `rest` is a closed mouth between sounds. */
export const VISEMES = ["rest", "MBP", "A", "E", "O", "U", "FV", "C"] as const;
export type Viseme = (typeof VISEMES)[number];
export type VowelChar = "a" | "e" | "i" | "o" | "u";

export interface Syllable {
  onset: Viseme;
  vowel: "A" | "E" | "O" | "U";
  vowelChar: VowelChar;
  /** Duration at normal pace. */
  ms: number;
  /** Silence after it. */
  pauseMs: number;
  /** 0–1 pitch rise, on the word before a "?". */
  rise: number;
  sentenceEnd: boolean;
  /** Stands in for a URL or code block: spoken low and short. */
  murmur: boolean;
}

export const CPS = 14;
const MIN_MS = 70;
const MAX_MS = 260;
const COMMA_MS = 120;
const STOP_MS = 300;
const MURMUR = "\u0001";
const VOWEL_VISEME = { a: "A", e: "E", i: "E", o: "O", u: "U" } as const;

const syllableMs = (letters: number) => Math.min(MAX_MS, Math.max(MIN_MS, (letters / CPS) * 1000));

function onsetViseme(consonants: string): Viseme {
  const c = consonants[0];
  if (!c) return "rest";
  if ("mbp".includes(c)) return "MBP";
  if ("fv".includes(c)) return "FV";
  if ("wq".includes(c)) return "U";
  return "C";
}

function syllable(onset: Viseme, vowelChar: VowelChar, letters: number, murmur = false): Syllable {
  return { onset, vowel: VOWEL_VISEME[vowelChar], vowelChar, ms: syllableMs(letters), pauseMs: 0, rise: 0, sentenceEnd: false, murmur };
}

/** Leading consonants + one vowel group per syllable; trailing consonants join the last one. "y" counts as a vowel. */
function wordSyllables(word: string): Syllable[] {
  const groups = [...word.matchAll(/([^aeiouy]*)([aeiouy]+)/g)];
  if (!groups.length) return [syllable(onsetViseme(word), "e", word.length)];
  const out = groups.map((g) => syllable(onsetViseme(g[1]), (g[2].replace(/y/g, "")[0] ?? "i") as VowelChar, g[0].length));
  const used = groups.reduce((n, g) => n + g[0].length, 0);
  out[out.length - 1].ms = syllableMs(groups[groups.length - 1][0].length + word.length - used);
  return out;
}

/** Turns finished text into syllables. Markdown is dropped; URLs and code blocks become a short murmur. */
export function toSyllables(text: string): Syllable[] {
  const clean = text
    .replace(/```[\s\S]*?```/g, ` ${MURMUR} `)
    .replace(/\bhttps?:\/\/\S+/g, ` ${MURMUR} `)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const out: Syllable[] = [];
  let word: Syllable[] = [];
  for (const [tok] of clean.matchAll(/\u0001|[a-z]+|[0-9]|[,;:]|[.!?]+/g)) {
    if (tok === MURMUR) word = [syllable("C", "e", 1.3, true), syllable("C", "e", 1.3, true)];
    else if (/[a-z]/.test(tok)) word = wordSyllables(tok);
    else if (/[0-9]/.test(tok)) word = [syllable("C", "e", 1)];
    else {
      const last = out[out.length - 1];
      if (!last) continue;
      if (/[,;:]/.test(tok)) {
        last.pauseMs = Math.max(last.pauseMs, COMMA_MS);
      } else {
        last.pauseMs = STOP_MS;
        last.sentenceEnd = true;
      }
      if (tok.includes("?")) {
        const tail = word.slice(-3);
        tail.forEach((s, i) => (s.rise = (i + 1) / tail.length));
      }
      continue;
    }
    out.push(...word);
  }
  return out;
}

/** Streams text in token-sized pieces, releasing only whole words so a word cut between tokens isn't split. */
export class Timeline {
  private pending = "";

  push(text: string): Syllable[] {
    this.pending += text;
    const space = /\s(?=\S*$)/.exec(this.pending);
    let cut = space ? space.index + 1 : 0;
    // An unclosed code fence stays pending until it closes, so code is never spoken.
    const ready = this.pending.slice(0, cut);
    if ((ready.split("```").length - 1) % 2 === 1) cut = ready.lastIndexOf("```");
    const out = toSyllables(this.pending.slice(0, cut));
    this.pending = this.pending.slice(cut);
    return out;
  }

  end(): Syllable[] {
    const rest = this.pending;
    this.pending = "";
    return toSyllables(rest);
  }
}
