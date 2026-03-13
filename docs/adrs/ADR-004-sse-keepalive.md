# ADR-004: SSE Keepalive and Reconnection

## Status: Proposed

## Context

VoidForge uses Server-Sent Events for two long-running operations: PRD generation (30-120s) and AWS provisioning (1-5 minutes). SSE connections are vulnerable to:
- Laptop sleep/wake dropping the TCP connection
- WiFi handoffs or VPN reconnects
- Corporate proxy timeouts (many enforce 30-60s idle limits)
- Browser connection timeout

Currently there are no keepalive messages and no reconnection support. A dropped stream leaves the user staring at a frozen spinner.

## Decision

1. **Server-side keepalive:** Send `: keepalive\n\n` comment every 15 seconds during SSE streams. SSE spec allows comment lines (starting with `:`) that are ignored by EventSource but keep the connection alive.

2. **Event IDs:** Include `id: N\n` with each data event so the browser's `Last-Event-ID` header enables resumption.

3. **Client-side reconnection:** The browser's native `EventSource` auto-reconnects. For fetch-based SSE readers (current approach), add manual reconnection with the last event ID.

4. **Incomplete detection:** If the stream ends without a `[DONE]` marker, treat the result as incomplete and warn the user.

## Consequences

- **Enables:** Resilient streaming through network disruptions, corporate proxies
- **Trade-off:** Slightly more complex SSE protocol, ~5 lines of server code per endpoint
- **Prevents:** Frozen UI, lost PRD content, invisible provisioning failures

## Alternatives

1. **Switch to polling** — Rejected: worse latency, more server load, defeats purpose of SSE
2. **WebSocket** — Rejected: more complex, SSE is sufficient for server→client push
3. **Do nothing** — Rejected: will fail for any user behind a corporate proxy
