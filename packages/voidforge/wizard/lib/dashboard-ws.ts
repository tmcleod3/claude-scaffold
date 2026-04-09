/**
 * Dashboard WebSocket infrastructure factory.
 * Creates WebSocket server instances for dashboards (Danger Room, War Room)
 * with heartbeat, connection management, origin validation, and broadcast.
 *
 * v22.0 (ADR-041 M5): Subscription rooms — clients subscribe to a project ID,
 * broadcasts are filtered by project. Global broadcasts (no projectId) reach all clients.
 */

import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import { getServerPort, getServerHost } from './server-config.js';
import { isLanMode } from './tower-auth.js';
import { isPrivateOrigin } from './network.js';

const HEARTBEAT_INTERVAL_MS = 30000;
const MAX_CLIENTS = 50;

// Symbol keys for WebSocket metadata
const PROJECT_ID_KEY = Symbol.for('voidforge.ws.projectId');
const IS_ALIVE_KEY = Symbol.for('voidforge.ws.isAlive');

export interface DashboardWs {
  /** Broadcast a message to all clients, or only to clients subscribed to a specific project. */
  broadcast: (data: { type: string; [key: string]: unknown }, projectId?: string) => void;
  /** Handle WebSocket upgrade for this dashboard's path. */
  handleUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer, projectId?: string) => void;
  /** Close all connections and shut down. */
  close: () => void;
  /** Current number of connected clients. */
  clientCount: () => number;
}

/**
 * Create a new dashboard WebSocket instance.
 * @param name — Human-readable name for logging (e.g., 'Danger Room')
 */
export function createDashboardWs(name: string): DashboardWs {
  const wss = new WebSocketServer({ noServer: true });
  const clients = new Set<WebSocket>();

  const heartbeat = setInterval(() => {
    for (const client of clients) {
      const ext = client as unknown as Record<symbol, unknown>;
      if (!ext[IS_ALIVE_KEY]) {
        clients.delete(client);
        client.terminate();
        continue;
      }
      ext[IS_ALIVE_KEY] = false;
      try { client.ping(); } catch { clients.delete(client); }
    }
  }, HEARTBEAT_INTERVAL_MS);

  return {
    broadcast(data, projectId?) {
      const message = JSON.stringify(data);
      for (const client of clients) {
        if (client.readyState !== WebSocket.OPEN) continue;

        // If projectId is specified, only send to clients subscribed to that project
        if (projectId) {
          const clientProject = (client as unknown as Record<symbol, unknown>)[PROJECT_ID_KEY];
          if (clientProject !== projectId) continue;
        }

        try { client.send(message); } catch { /* client gone */ }
      }
    },

    handleUpgrade(req, socket, head, projectId?) {
      const origin = req.headers.origin || '';
      const port = getServerPort();
      const allowed = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
      const remoteHost = getServerHost();
      if (remoteHost) allowed.push(`https://${remoteHost}`);

      const originAllowed = allowed.includes(origin)
        || (isLanMode() && isPrivateOrigin(origin));

      if (!origin || !originAllowed) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      if (clients.size >= MAX_CLIENTS) {
        socket.write('HTTP/1.1 503 Service Unavailable\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(req, socket, head, (ws) => {
        clients.add(ws);
        const ext = ws as unknown as Record<symbol, unknown>;
        ext[IS_ALIVE_KEY] = true;

        // Tag with project ID if provided at upgrade time
        if (projectId) {
          ext[PROJECT_ID_KEY] = projectId;
        }

        // Handle subscription messages from the client
        ws.on('message', (raw) => {
          try {
            const msg = JSON.parse(String(raw)) as { type?: string; projectId?: string };
            if (msg.type === 'subscribe' && typeof msg.projectId === 'string') {
              ext[PROJECT_ID_KEY] = msg.projectId;
            }
          } catch { /* ignore non-JSON or malformed messages */ }
        });

        ws.on('pong', () => { ext[IS_ALIVE_KEY] = true; });
        ws.on('close', () => clients.delete(ws));
        ws.on('error', () => clients.delete(ws));
      });
    },

    close() {
      clearInterval(heartbeat);
      for (const client of clients) {
        try { client.close(1001, 'Server shutting down'); } catch { /* ignore */ }
      }
      clients.clear();
      wss.close();
    },

    clientCount() {
      return clients.size;
    },
  };
}
