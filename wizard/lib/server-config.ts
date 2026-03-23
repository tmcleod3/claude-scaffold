/**
 * Server configuration — port and host state, shared across modules.
 * Extracted from server.ts to break circular import:
 * server.ts → danger-room.ts → dashboard-ws.ts → server.ts
 * Now: server.ts → server-config.ts ← dashboard-ws.ts (no cycle)
 * (Gauntlet Picard DR-02)
 */

let serverPort = 0;
let serverHost = '';

export function setServerPort(port: number): void {
  serverPort = port;
}

export function setServerHost(host: string): void {
  serverHost = host;
}

/** Get the server port for WebSocket origin validation. */
export function getServerPort(): number {
  return serverPort;
}

/** Get the server host for remote-mode WebSocket origin validation. */
export function getServerHost(): string {
  return serverHost;
}
