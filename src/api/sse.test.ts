import { SseParser } from "./sse";

test("parses events split at arbitrary chunk boundaries, with CRLF separators", () => {
  const p = new SseParser();
  const body = 'event: start\r\ndata: {"conversation_id":"c1"}\r\n\r\nevent: token\r\ndata: {"text":"Hi"}\r\n\r\n';
  const out = [];
  for (let i = 0; i < body.length; i += 7) out.push(...p.push(body.slice(i, i + 7)));
  out.push(...p.end());
  expect(out).toEqual([
    { event: "start", data: '{"conversation_id":"c1"}' },
    { event: "token", data: '{"text":"Hi"}' },
  ]);
});

test("a CR at the end of one chunk and LF at the start of the next is one line break", () => {
  const p = new SseParser();
  expect(p.push("event: done\r")).toEqual([]);
  expect(p.push("\ndata: {}\r\n\r\n")).toEqual([{ event: "done", data: "{}" }]);
});

test("multi-line data, comments, and a last event without a trailing blank line", () => {
  const p = new SseParser();
  const out = p.push(": ping\n\nevent: notice\ndata: a\ndata: b\n\ndata: tail");
  expect(out).toEqual([{ event: "notice", data: "a\nb" }]);
  expect(p.end()).toEqual([{ event: "message", data: "tail" }]);
});
