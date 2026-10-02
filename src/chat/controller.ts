import { GatewayError, type ChatEvent } from "../api/gateway";
import type { CharacterEngine } from "../engine/character-engine";
import type { SoundName } from "../sound/names";
import type { SpeechBackend } from "../speech/backend";
import type { Link } from "../api/link";
import { noticeReaction, resultReaction, strongerOutcome, toolAction, type Outcome } from "./agent-map";
import { FINISH_BEAT_MS, S, toolLabel } from "../strings";

export interface ErrorAction {
  label: string;
  run(): void;
}

export interface ChatView {
  addUser(text: string): void;
  /** Show the typing dots until the first appendReply. */
  startReply(): void;
  appendReply(text: string): void;
  addNotice(text: string): void;
  showError(message: string, action: ErrorAction | null): void;
  setBusy(busy: boolean): void;
  addActivity(line: string): void;
  clearActivity(): void;
}

export interface ControllerDeps {
  gateway: { chatStream(message: string, conversationId: string | null): AsyncIterable<ChatEvent> };
  engine: Pick<CharacterEngine, "claim" | "release" | "state" | "express">;
  /** Told whether each chat stream reached the agent; absent for scripted turns. */
  link?: Pick<Link, "reportUp" | "reportDown">;
  view: ChatView;
  sound: (s: SoundName) => void;
  signIn: () => void;
  later: (ms: number, fn: () => void) => void;
  onConversation?: (id: string) => void;
  speech: Pick<SpeechBackend, "push" | "end" | "stop" | "speaking" | "drained">;
  /** Speech was cut off by the person: play the chirp and the character's reaction. */
  onInterrupt: () => void;
}

/** One chat turn at a time: gateway events drive the character, the log and the activity ticker. */
export class ChatController {
  conversationId: string | null = null;
  private running = false;
  private silenced = false;
  // Each run gets a number, so a turn still waiting on its speech can tell a newer turn has taken over.
  private turn = 0;
  // The reply's words while the finished beat plays; voiced when it ends. Null when nothing is held.
  private held: string[] | null = null;

  constructor(private readonly d: ControllerDeps) {}

  get busy(): boolean {
    return this.running;
  }

  /** Also true while the voice is held for the finished beat: it's about to speak. */
  get speaking(): boolean {
    return this.d.speech.speaking || this.held !== null;
  }

  /** Cuts Uriel off mid-sentence; the rest of the current reply stays silent. */
  interrupt(): void {
    if (!this.speaking) return;
    this.held = null;
    this.d.speech.stop();
    this.silenced = true;
    if (this.running) this.d.engine.release("task");
    this.d.onInterrupt();
  }

  /** Stops speech without the cut-off reaction, e.g. when the person leaves this conversation. */
  hush(): void {
    if (!this.speaking) return;
    this.held = null;
    this.d.speech.stop();
    this.silenced = true;
    this.d.engine.release("task");
  }

  async send(text: string): Promise<void> {
    const message = text.trim();
    if (!message || this.running) return;
    this.d.view.addUser(message);
    this.d.sound("send");
    await this.run(message);
  }

  newConversation(): void {
    if (this.running) return;
    this.leave();
    this.conversationId = null;
  }

  openConversation(id: string): void {
    if (this.running) return;
    this.leave();
    this.conversationId = id;
  }

  // The outcome belongs to the conversation being left, and a turn still finishing its speech must not claim it.
  private leave(): void {
    this.hush();
    this.turn++;
    this.d.engine.release("task");
  }

  private async run(message: string): Promise<void> {
    // Retry buttons from earlier failures stay clickable, so the guard lives here, not only in send().
    if (this.running) return;
    // A new message or a Retry cuts off whatever is still being said.
    this.interrupt();
    const turn = ++this.turn;
    const { view, engine } = this.d;
    this.running = true;
    view.setBusy(true);
    view.clearActivity();
    view.addActivity(S.thinking);
    view.startReply();
    engine.claim("task", "thinking");
    this.silenced = false;
    // Talking is set on the first words, and again after a tool call moved the character to working.
    let looksTalking = false;
    // Tools ran since the character last talked: the next words open with the finished beat.
    let worked = false;
    let beat: Promise<void> = Promise.resolve();
    const say = (text: string) => {
      view.appendReply(text);
      if (!looksTalking) {
        looksTalking = true;
        // The words are the status now; a later tool call shows its own line again.
        view.clearActivity();
        // While a beat plays, words after another tool call just join the held voice; the beat hands over to talking.
        if (!this.silenced && !this.held) {
          if (worked) beat = this.finishBeat(turn, () => looksTalking);
          else engine.claim("task", "talking");
        }
        worked = false;
      }
      if (this.silenced) return;
      if (this.held) this.held.push(text);
      else this.d.speech.push(text);
    };
    let streamed = false;
    // What the turn leaves on screen after the reply: a draft waiting for a yes, or a question.
    let outcome: Outcome | null = null;
    let reached = false;
    let failure: { message: string; action: ErrorAction | null } | null = null;
    const retry: ErrorAction = { label: S.retry, run: () => void this.run(message) };
    try {
      for await (const ev of this.d.gateway.chatStream(message, this.conversationId)) {
        if (!reached) {
          reached = true;
          this.d.link?.reportUp();
        }
        switch (ev.type) {
          case "start":
            this.conversationId = ev.conversationId;
            this.d.onConversation?.(ev.conversationId);
            break;
          case "tool_call":
            engine.claim("task", toolAction(ev.action));
            looksTalking = false;
            worked = true;
            view.addActivity(toolLabel(ev.name));
            break;
          case "tool_result": {
            const r = resultReaction(ev);
            if (r.expression) engine.express(r.expression.name, r.expression.ms);
            outcome = strongerOutcome(outcome, r.outcome);
            break;
          }
          case "token":
            streamed = true;
            say(ev.text);
            break;
          case "final":
            if (!streamed) say(ev.text);
            break;
          case "notice": {
            view.addNotice(ev.text);
            const r = noticeReaction(ev.code);
            if (r) engine.express(r.name, r.ms);
            break;
          }
          case "error":
            failure ??= { message: ev.message, action: retry };
            break;
          case "done":
            break;
        }
      }
    } catch (e) {
      if (e instanceof GatewayError && (e.kind === "unreachable" || (e.kind === "http" && e.status === 404))) {
        this.d.link?.reportDown();
      }
      failure = this.describe(e, retry);
    } finally {
      this.running = false;
      view.setBusy(false);
    }
    if (failure) {
      this.held = null;
      this.d.speech.stop();
      engine.claim("task", "error");
      view.showError(failure.message, failure.action);
      return;
    }
    await beat;
    if (turn !== this.turn) return; // a newer turn owns the character now
    this.d.speech.end();
    await this.d.speech.drained();
    if (turn !== this.turn) return;
    // A cut-off reply still leaves its outcome: the draft or the question exists either way.
    if (outcome) engine.claim("task", outcome);
    else engine.release("task");
  }

  /**
   * The work is done: the finished hop and chime call the person back, and the reply's voice waits for it (the text
   * streams on). Then the held words are spoken, and the character talks unless a newer tool call is still running.
   */
  private finishBeat(turn: number, wordsNow: () => boolean): Promise<void> {
    this.d.engine.claim("task", "finished");
    this.held = [];
    return new Promise((resolve) => {
      this.d.later(FINISH_BEAT_MS, () => {
        const words = this.held;
        this.held = null;
        if (words && turn === this.turn) {
          if (wordsNow()) this.d.engine.claim("task", "talking");
          for (const w of words) this.d.speech.push(w);
        }
        resolve();
      });
    });
  }

  private describe(e: unknown, retry: ErrorAction): { message: string; action: ErrorAction | null } {
    if (e instanceof GatewayError) {
      if (e.kind === "auth") return { message: S.signedOut, action: { label: S.signIn, run: () => this.d.signIn() } };
      if (e.kind === "keychain") return { message: S.keychain, action: null };
      // 5xx is the gateway restarting or a proxy in front of it failing, and 404 is a gateway without the chat route:
      // worth retrying, not worth a raw status.
      if (e.kind === "http" && e.status !== 404 && (e.status ?? 0) < 500) return { message: e.message, action: null };
    }
    return { message: S.unreachable, action: retry };
  }
}
