/**
 * Dashboard WebSocket infrastructure factory.
 * Creates WebSocket server instances for dashboards (Danger Room, War Room)
 * with heartbeat, connection management, origin validation, and broadcast.
 */

import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import { getServerPort, getServerHost } from './server-config.js';
import { isLanMode } from './tower-auth.js';
import { isPrivateOrigin } from './network.js';

const HEARTBEAT_INTERVAL_MS = 30000;
const MAX_CLIENTS = 50;

export interface DashboardWs {
  /** Broadcast a message to all connected clients. */
  broadcast: (data: { type: string; [key: string]: unknown }) => void;
  /** Handle WebSocket upgrade for this dashboard's path. */
  handleUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
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
      const ext = client as unknown as Record<string, boolean>;
      if (!ext.isAlive) {
        clients.delete(client);
        client.terminate();
        continue;
      }
      ext.isAlive = false;
      try { client.ping(); } catch { clients.delete(client); }
    }
  }, HEARTBEAT_INTERVAL_MS);

  return {
    broadcast(data) {
      const message = JSON.stringify(data);
      for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
          try { client.send(message); } catch { /* client gone */ }
        }
      }
    },

    handleUpgrade(req, socket, head) {
      const origin = req.headers.origin || '';
      const port = getServerPort();
      const allowed = [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
      const remoteHost = getServerHost();
      if (remoteHost) allowed.push(`https://${remoteHost}`);

      // In LAN mode, accept connections from any private IP origin
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
        (ws as unknown as Record<string, boolean>).isAlive = true;

        ws.on('pong', () => { (ws as unknown as Record<string, boolean>).isAlive = true; });
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
