import type { IncomingMessage, ServerResponse } from 'node:http';

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>;

interface Route {
  method: string;
  path: string;
  handler: Handler;
}

const routes: Route[] = [];

export function addRoute(method: string, path: string, handler: Handler): void {
  routes.push({ method: method.toUpperCase(), path, handler });
}

export function route(req: IncomingMessage, res: ServerResponse): Handler | null {
  const method = req.method?.toUpperCase() ?? 'GET';
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;

  for (const r of routes) {
    if (r.method === method && r.path === path) {
      return r.handler;
    }
  }
  return null;
}
