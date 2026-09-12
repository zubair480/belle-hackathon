"use client";
/**
 * Chat panel for the agent harness. In mock mode the deterministic stub planner runs in the
 * browser; in live mode the request goes to /api/agent/chat where the server selects the stub
 * or the Qoder Agent SDK. Tool calls are shown as chips; UI actions are applied to the
 * workspace. The agent never saves issues: drafts open the form for the user.
 */
import { useEffect, useRef, useState } from "react";
import { runStubTurn } from "../../agent/stubPlanner";
import type { AgentChatResponse, AgentMessage, ToolCallRecord } from "../../agent/types";
import { useWorkspace } from "../../features/recall/context";
import type { ClientError } from "../../features/recall/api/types";
import { Banner, ErrorBanner } from "./primitives";

type ChatEntry = AgentMessage & { toolCalls?: ToolCallRecord[]; provider?: AgentChatResponse["provider"]; warnings?: string[] };

const SUGGESTIONS = [
  "The charge port is misaligned, where should I look?",
  "The right front tire has an issue",
  "Ignition does not respond on DEMO-EV-007",
  "Who did we supply with parts from this connector's batch?",
  "Circle the bracket and the charge connector",
  "Show the wiring on the charge port",
  "Open an issue for the marked parts",
];

export function AgentChat() {
  const ws = useWorkspace();
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ClientError | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  /** Mock mode runs the stub planner in the browser unless NEXT_PUBLIC_RECALL_AGENT=server routes chat to /api/agent/chat (e.g. to test the Qoder planner). */
  const local = ws.client.mode === "mock" && process.env.NEXT_PUBLIC_RECALL_AGENT !== "server";

  useEffect(() => {
    scroller.current?.scrollTo?.({ top: scroller.current.scrollHeight });
  }, [entries, pending]);

  const send = async (text: string) => {
    const content = text.trim();
    if (!content || pending) return;
    setError(null);
    const history: AgentMessage[] = [...entries.map((e) => ({ role: e.role, content: e.content })), { role: "user", content }];
    setEntries((es) => [...es, { role: "user", content }]);
    setInput("");
    setPending(true);
    const request = { messages: history.slice(-20), context: ws.agentContext(), sessionId };
    let response: AgentChatResponse | null = null;
    if (local) {
      response = await runStubTurn({ client: ws.client, catalog: ws.catalog, context: request.context, ui: [] }, request);
    } else {
      const r = await ws.client.agentChat(request);
      if (r.ok) response = r.data;
      else setError(r.error);
    }
    setPending(false);
    if (!response) return;
    setSessionId(response.sessionId);
    ws.applyUiActions(response.uiActions);
    setEntries((es) => [...es, { role: "assistant", content: response!.reply, toolCalls: response!.toolCalls, provider: response!.provider, warnings: response!.warnings }]);
  };

  return (
    <aside className="rrx-chat" aria-label="Assistant" data-testid="agent-chat">
      <div className="rrx-chat-head">
        <div>
          <strong>Assistant</strong>
          <div className="rrx-muted rrx-small" data-testid="chat-backend-label">
            {local
              ? "Built-in assistant · sample data"
              : `Server agent · reads ${ws.backend.health ? (ws.backend.health.servicesMode === "graph" ? "Neo4j graph services" : "demo data (service double)") : "the real routes"}`}
          </div>
        </div>
        <button type="button" className="rrx-btn rrx-btn--sm rrx-btn--ghost" onClick={() => ws.setChatOpen(false)} aria-label="Close assistant">
          ×
        </button>
      </div>
      <div className="rrx-chat-scroll" ref={scroller}>
        {!entries.length ? (
          <div className="rrx-stack">
            <Banner kind="info">Ask about a part, a symptom or a circuit. I zoom the sketch, read provenance, list issues, trace wiring and show which customers received parts from the same batch or lot. I never save or close an issue for you.</Banner>
            <div className="rrx-chips">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="rrx-chip" onClick={() => send(s)} disabled={pending}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {entries.map((e, i) => (
          <div key={i} className={`rrx-msg rrx-msg--${e.role}`} data-testid={`msg-${e.role}`}>
            {e.toolCalls?.length ? (
              <div className="rrx-chips" style={{ marginBottom: 6 }}>
                {e.toolCalls.map((t, j) => (
                  <span key={j} className={`rrx-chip rrx-chip--tool${t.ok ? "" : " rrx-chip--tool-error"}`} title={JSON.stringify(t.input)} data-testid={`toolcall-${t.name}`}>
                    ⚙ {t.name}
                  </span>
                ))}
              </div>
            ) : null}
            <div className="rrx-msg-body">{e.content}</div>
            {e.provider ? <div className="rrx-muted rrx-small" style={{ marginTop: 4 }}>{e.provider.name}{e.provider.model ? ` · ${e.provider.model}` : ""}</div> : null}
            {e.warnings?.length ? <div className="rrx-muted rrx-small">{e.warnings.join(" ")}</div> : null}
          </div>
        ))}
        {pending ? <div className="rrx-muted rrx-small"><span className="rrx-spinner" />Working…</div> : null}
        {error ? <ErrorBanner error={error} /> : null}
      </div>
      <form
        className="rrx-chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. the right front tire has an issue" aria-label="Message" disabled={pending} data-testid="chat-input" />
        <button type="submit" className="rrx-btn rrx-btn--primary" disabled={pending || !input.trim()} data-testid="chat-send">
          Send
        </button>
      </form>
    </aside>
  );
}
