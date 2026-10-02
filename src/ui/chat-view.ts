import type { ChatView } from "../chat/controller";
import type { ChatLog } from "./chat-log";
import type { InputBar } from "./input";
import type { Ticker } from "./ticker";

export function chatView(log: ChatLog, ticker: Ticker, input: InputBar): ChatView {
  return {
    addUser: (t) => log.addUser(t),
    startReply: () => log.startReply(),
    appendReply: (t) => log.appendReply(t),
    addNotice: (t) => log.addNotice(t),
    showError: (m, a) => log.showError(m, a),
    setBusy: (b) => input.setBusy(b),
    addActivity: (l) => ticker.add(l),
    clearActivity: () => ticker.clear(),
  };
}
