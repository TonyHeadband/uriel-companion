# Talking mouth: phonetic mouth shapes and a placeholder voice

Status: design (2026-10-01). Builds on the [companion app design](2026-09-30-companion-app-design.md).

## Why
Uriel answers in text, but the character only shows *that* it is working, never that it is *saying* something. A mouth
that moves with the answer, with a cute gibberish voice, makes the character feel like it's talking to you. One day a
real audio pipeline (TTS on Homelab) will speak the answers; this design leaves a single seam for it so the mouth and
the renderer don't change when it arrives.

## What it does
- While Uriel's reply comes in, a mouth appears and "speaks" it: each syllable gets a mouth shape picked from its
  letters, and a short voice blip whose pitch follows the vowel.
- The reply text still appears in the chat log as fast as it streams (as today). The speech works through the same
  text at speaking pace, so it lags behind and may keep talking after the text is complete.
- When it stops talking the mouth fades out. Faces are eyes-only when silent, as now.
- A new message, or a click on the character, interrupts it: a quick "cut off" chirp, a squash, wide eyes for a moment,
  and the mouth snaps shut.

## Decisions
- **Text-driven, not audio-driven.** Shapes come from the text, so they are phonetic (an "o" looks like an "o"). Audio
  amplitude would only give open/closed. A future TTS reports phoneme timings, which map onto the same shapes.
- **Mouth hidden when silent.** Keeps the current minimal faces; the mouth fades in over ~120 ms when speech starts
  and out over ~200 ms after the last syllable.
- **Speech lags the text.** The log is never held back by the voice. Pace is ~14 characters per second.
- **Long replies are a setting** (Settings tab, "Long replies"):
  - `all` (default): speak everything at normal pace, however long. For when you're listening, not reading.
  - `fit`: normal pace, but once the reply is complete the rest is sped up (at most 3×, then syllables are dropped
    evenly) so speech ends at most 8 s later.
  - `first`: speak up to the end of the second sentence, then close the mouth; the rest is read silently.
- **Animalese-style voice.** One short tone per syllable. The vowel picks the pitch, a question rises at the end,
  punctuation pauses. Each character has its own voice.
- **`finished` waits for speech.** The finish chime and green glow come when speech ends naturally, not mid-sentence.
  If the speech is interrupted, the character goes to `idle` with no chime. Errors still show straight away and cut the speech.
- **A `talking` state.** On the first reply token the character leaves `thinking`/`working` for `talking` (soft
  glow, plain eyes, no badge), so it isn't speaking with "thinking" eyes. A tool call after that switches back to
  `working`/`searching` as today; speech keeps playing through it.
- **Mute silences the voice only.** The mouth still moves with sound off, since it carries meaning on its own.
  Reduced motion keeps the mouth (it's information) but drops the squash on interrupt.

## Mouth shapes (visemes)
| Viseme | From | Round characters | Square characters (grid) |
|---|---|---|---|
| `rest` | pauses | closed (hidden after fade) | same |
| `MBP` | m, b, p | lips pressed: short flat bar | flat bar |
| `A` | a | wide, tall open | tall rounded rectangle |
| `E` | e, i, y | wide, short open | wide short rectangle |
| `O` | o | round | rounded square |
| `U` | u, w, q | small round | small rounded square |
| `FV` | f, v | bar with a small top-teeth strip | same, square-cut |
| `C` | every other consonant | slightly open | slightly open rectangle |

The renderer eases between shapes using an `open` amount (0–1), so it never snaps except on interrupt. Square
characters keep the no-circles rule.

Each character gets a mouth placement next to its eye placement: `mouth: { w, h, y }` in units of R, on the same
head sphere as the eyes, so the mouth turns with the face (yaw/pitch).

## Text → speech timeline (`src/speech/timeline.ts`, pure)
Input: reply text, incrementally. Output: a queue of `Syllable`s.

```ts
type Viseme = "rest" | "MBP" | "A" | "E" | "O" | "U" | "FV" | "C";
interface Syllable {
  onset: Viseme;      // shape for the leading consonant(s), "rest" if none
  vowel: "A" | "E" | "O" | "U";
  vowelChar: "a" | "e" | "i" | "o" | "u";
  ms: number;         // duration at normal pace: letters / 14 cps, clamped 70–260 ms
  pauseMs: number;    // silence after: 120 for , ; :  — 300 for . ! ?  — 0 otherwise
  rise: number;       // 0–1 pitch rise, ramped over the word before a "?" (up to 3 syllables)
  sentenceEnd: boolean;
}
```

Rules:
- Normalise with NFD and drop accents, so Italian `è ò ù` count as vowels; lowercase.
- Strip markdown markers (`* _ # > \``), and replace URLs and fenced code blocks with a two-syllable murmur
  (`C`/`E` shapes, low pitch), so they aren't spelled out.
- Split into words; split words into syllables at vowel clusters: each syllable = leading consonants + one vowel
  group (trailing consonants of the last syllable attach to it).
- Digits are one syllable each with vowel `e`. The murmur is two syllables of onset `C`, vowel `E`.
- A word with no vowel ("hmm", "brr") is one syllable with vowel `E`.
- Text arrives in token-sized pieces that can cut a word in half, so the timeline only emits up to the last
  whitespace (which also keeps a streamed URL whole) and flushes the rest on `end()`.

## Speech backend: the seam
```ts
interface Mouth { viseme: Viseme; open: number }

interface SpeechBackend {
  push(text: string): void;          // more reply text arrived
  end(): void;                       // reply complete
  stop(): void;                      // interrupt: silence now, mouth snaps shut
  update(nowMs: number): Mouth | null; // advance to now (once per frame), return the mouth; null when silent
  readonly speaking: boolean;
  /** Resolves true when speech finishes naturally (at once if there was nothing to say), false when stopped. */
  drained(): Promise<boolean>;
}
```
- M2 ships `BlipSpeech` (`src/speech/blip-speech.ts`): timeline + `Voice` + clock. The long-reply mode is applied
  here (`all` / `fit` / `first`).
- A future `TtsSpeech` implements the same interface from audio plus phoneme timings, and nothing else changes.

### Voice
```ts
interface Voice {
  syllable(s: Syllable, rate: number): void; // rate > 1 when sped up (fit mode)
  interrupted(): void;
}
```
`BlipVoice` (`src/speech/blip-voice.ts`) plays through the existing `Synth`, which gains a `playRecipe(recipe)`
next to `play(name)`, so voice blips share the master volume, compressor, room and idle suspend.
- Per-character voice in `CharacterDef.voice: { base: number; wave: OscillatorType }`: angel soft sine ~520 Hz,
  flame bright triangle ~600 Hz, orb mellow sine ~440 Hz, grid square ~480 Hz.
- Vowel pitch multipliers: a 0.9, e 1.1, i 1.25, o 0.95, u 0.85, plus ±4% seeded jitter so repeats don't sound
  robotic; `rise` adds up to +25%.
- Blip length = 70% of the syllable, quick attack, short decay; the onset consonant adds a tiny noise tick for
  `C`/`FV`.
- `interrupted()` plays the new `interrupt` recipe: a fast downward chirp (~900 → 300 Hz, 120 ms).

## Engine and renderer
- `Pose` gains `mouth: { viseme, open, alpha } | null` (alpha fades the whole mouth in and out). `CharacterEngine` takes an optional `mouth: (nowMs) => Mouth | null`
  provider and eases `open` (fade in/out, shape blending); a `stop()` snap sets it straight to closed.
- `STATES` gains `talking: { color: #FFD9A8 (warm peach), tint 0.2, glow 0.4, eye "pill", badge null }`.
- `Flat2D` draws the mouth after the eyes, in the ink/neon colour, round or square by `geometry`. The no-circles
  test for grid extends to every viseme.

## Chat turn → speech
`ChatController` gains a `speech: SpeechBackend` dependency:
- `send()`: if `speech.speaking`, call `speech.stop()` and the interrupt reaction first.
- `token` / `final` (when nothing streamed): `speech.push(text)`; on the first one, `engine.setState("talking")`.
- Stream done without error: `speech.end()`; the controller is no longer busy (the input is enabled while it talks),
  then `await speech.drained()` → `true`: `finished` + chime as today; `false`: `idle`.
- Error: `speech.stop()` (no interrupt chirp, the error sound plays), then the error state as today.

Interrupt reaction (in the app, shared by new message and character click): `speech.stop()`, `voice.interrupted()`,
`engine.squash()` (skipped with reduced motion), `engine.emote("surprised", 600, true)`.

Character click while speaking interrupts *instead of* the poke reaction; when silent, clicks poke as today.

## Config
`speech: { long: "all" | "fit" | "first" }`, default `all`, unknown values fall back. Settings tab: a "Long replies"
pick-one choice ("Speak it all", "Fit in 8 s", "First bit") under Sound.

## Testing
- `timeline`: syllable splitting (English and Italian words), viseme picks, accents, digits, pauses, question rise,
  markdown/URL/code murmur, half-word tokens held until a boundary and flushed on `end()`.
- `BlipSpeech` on a fake clock: lag behind the text, queue growth while streaming, `all`/`fit` (ends ≤ 8 s after
  `end()`)/`first` (stops after the second sentence end), `stop()` silences and resolves `drained()` false, natural
  end resolves true.
- `BlipVoice` with the fake `AudioContext`: pitch per vowel, rise, character voice, mute respected.
- Controller: talking state on first token, `finished` only after drain, interrupt on a new send, error stops
  speech.
- Renderer: every viseme draws for all four characters; grid draws no circles for any viseme.
- Debug panel: a "Speak" group with a sample sentence, a long paragraph, and a question, to tune by eye and ear.

## Not in this piece
- Real TTS and an audio pipeline on Uriel's side (the `SpeechBackend` seam is the prepared hook).
- Per-language voices or real phoneme dictionaries; the letter rules are rough on purpose and work for English and
  Italian.
- Mood-driven resting mouths (smile/frown when silent).
