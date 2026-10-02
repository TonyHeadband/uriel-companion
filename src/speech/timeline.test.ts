import { Timeline, toSyllables } from "./timeline";

const onsets = (t: string) => toSyllables(t).map((s) => s.onset);
const vowels = (t: string) => toSyllables(t).map((s) => s.vowel);

test("words split into syllables at vowel groups", () => {
  expect(onsets("banana")).toEqual(["MBP", "C", "C"]);
  expect(vowels("banana")).toEqual(["A", "A", "A"]);
});

test("consonants and vowels pick their mouth shapes", () => {
  expect(onsets("ma fe wo lu")).toEqual(["MBP", "FV", "U", "C"]);
  expect(vowels("ma fe wo lu")).toEqual(["A", "E", "O", "U"]);
  expect(onsets("a")).toEqual(["rest"]);
});

test("Italian accented vowels count as vowels", () => {
  expect(vowels("perché però")).toEqual(["E", "E", "E", "O"]);
});

test("a syllable lasts letters / 14 s, clamped to 70–260 ms", () => {
  expect(toSyllables("a")[0].ms).toBeCloseTo(1000 / 14, 5);
  expect(toSyllables("strengths")[0].ms).toBe(260);
  expect(toSyllables("toto")[0].ms).toBeCloseTo((2 / 14) * 1000, 5);
});

test("punctuation pauses, and sentence ends are marked", () => {
  const s = toSyllables("hi, there. ok");
  expect(s.map((x) => x.pauseMs)).toEqual([120, 0, 300, 0]);
  expect(s.map((x) => x.sentenceEnd)).toEqual([false, false, true, false]);
});

test("a question rises over the word before the question mark", () => {
  const s = toSyllables("are you ready?"); // a-re you rea-dy
  expect(s.map((x) => x.rise)).toEqual([0, 0, 0, 0.5, 1]);
});

test("digits are one syllable each", () => {
  expect(toSyllables("2024")).toHaveLength(4);
});

test("URLs and code blocks become a short murmur instead of being spelled out", () => {
  const s = toSyllables("see https://x.io/a and ```js\nlet a = 1\n``` ok");
  expect(s).toHaveLength(7);
  expect(s.filter((x) => x.murmur)).toHaveLength(4);
});

test("markdown markers are silent", () => {
  expect(toSyllables("**bold** _it_")).toEqual(toSyllables("bold it"));
});

test("text with no letters has no syllables", () => {
  expect(toSyllables("👍 ...")).toEqual([]);
});

test("a word cut across tokens waits for the next space", () => {
  const t = new Timeline();
  expect(t.push("hel")).toEqual([]);
  expect(t.push("lo wor")).toHaveLength(2);
  expect(t.end()).toHaveLength(1);
});

test("an unclosed code fence is held until it closes", () => {
  const t = new Timeline();
  expect(t.push("look ```js\nlet x")).toHaveLength(1);
  const next = t.push(" = 1\n``` ok");
  expect(next).toHaveLength(2);
  expect(next.every((s) => s.murmur)).toBe(true);
  expect(t.end()).toHaveLength(1);
});
