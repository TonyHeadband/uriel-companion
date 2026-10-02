export interface SseMessage {
  event: string;
  data: string;
}

/** Incremental text/event-stream parser (event and data fields only, which is all the gateway sends). */
export class SseParser {
  private buf = "";
  private event = "";
  private data: string[] = [];

  push(chunk: string): SseMessage[] {
    this.buf += chunk;
    const out: SseMessage[] = [];
    for (;;) {
      const i = this.buf.search(/\r\n|\r|\n/);
      if (i === -1) break;
      // A lone CR at the end may be the first half of a CRLF split across chunks.
      if (this.buf[i] === "\r" && i === this.buf.length - 1) break;
      const line = this.buf.slice(0, i);
      this.buf = this.buf.slice(this.buf.startsWith("\r\n", i) ? i + 2 : i + 1);
      this.line(line, out);
    }
    return out;
  }

  end(): SseMessage[] {
    const out: SseMessage[] = [];
    if (this.buf) this.line(this.buf.replace(/\r$/, ""), out);
    this.buf = "";
    this.line("", out);
    return out;
  }

  private line(line: string, out: SseMessage[]): void {
    if (line === "") {
      if (this.data.length) out.push({ event: this.event || "message", data: this.data.join("\n") });
      this.event = "";
      this.data = [];
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") this.event = value;
    else if (field === "data") this.data.push(value);
  }
}
