/**
 * SSE Endpoint Pattern — Server-Sent Events with proper lifecycle management
 *
 * Use for: streaming AI responses, progress bars, real-time notifications
 * Don't use for: bidirectional communication (use WebSocket instead)
 *
 * Adaptations:
 * - Express: res.writeHead + res.write (shown below)
 * - FastAPI: StreamingResponse with async generator
 * - Django: StreamingHttpResponse with iterator
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

// ── Express/Node SSE endpoint ──────────────────────

export function handleSSE(req: IncomingMessage, res: ServerResponse): void {
  // Headers — must be set before any write
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  // Keepalive — prevents proxy timeout (Caddy: 60s, nginx: 60s, Cloudflare: 100s)
  const keepalive = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15000);

  // Connection timeout — don't hold connections forever
  const MAX_DURATION_MS = 5 * 60 * 1000; // 5 minutes
  const timeout = setTimeout(() => {
    sendEvent(res, 'done', { reason: 'timeout' });
    cleanup();
  }, MAX_DURATION_MS);

  // Cleanup on client disconnect
  req.on('close', cleanup);

  function cleanup(): void {
    clearInterval(keepalive);
    clearTimeout(timeout);
    if (!res.writableEnded) res.end();
  }

  // Send a typed event
  function sendEvent(response: ServerResponse, event: string, data: unknown): void {
    if (response.writableEnded) return;
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  // ── Your streaming logic here ──────────────────
  // Example: stream AI response chunks
  // for await (const chunk of aiStream) {
  //   sendEvent(res, 'chunk', { text: chunk });
  // }
  // sendEvent(res, 'done', { totalTokens: 1234 });
  // cleanup();
}

// ── Client-side (vanilla JS) ──────────────────────
//
// const source = new EventSource('/api/stream');
// source.addEventListener('chunk', (e) => {
//   const data = JSON.parse(e.data);
//   appendToUI(data.text);
// });
// source.addEventListener('done', (e) => {
//   source.close();
// });
// source.addEventListener('error', () => {
//   // EventSource auto-reconnects — add backoff if needed
//   source.close();
// });

// ── React SSE hook ────────────────────────────────
//
// Use useRef for mutable callbacks in SSE handlers:
//   const onChunkRef = useRef(onChunk);
//   onChunkRef.current = onChunk; // Update ref on every render
//   useEffect(() => {
//     const source = new EventSource(url);
//     source.addEventListener('chunk', (e) => onChunkRef.current(e));
//     return () => source.close();
//   }, [url]); // Only url in deps, NOT onChunk
//
// Why: EventSource registers callbacks once. If onChunk is in the dep array,
// the effect re-runs on every render, creating/destroying EventSource rapidly.
// The ref pattern gives the handler access to fresh state without re-registering.
// (Field report #77: React SSE handler captured stale closure, missed updates)

// ── FastAPI adaptation ────────────────────────────
//
// from fastapi.responses import StreamingResponse
// import asyncio, json
//
// @app.get("/api/stream")
// async def stream():
//     async def generate():
//         yield f"event: start\ndata: {json.dumps({'status': 'connected'})}\n\n"
//         async for chunk in ai_stream():
//             yield f"event: chunk\ndata: {json.dumps({'text': chunk})}\n\n"
//         yield f"event: done\ndata: {json.dumps({'status': 'complete'})}\n\n"
//     return StreamingResponse(generate(), media_type="text/event-stream")

// ── Django adaptation ─────────────────────────────
//
// from django.http import StreamingHttpResponse
// import json
//
// def stream_view(request):
//     def generate():
//         yield f"event: start\ndata: {json.dumps({'status': 'connected'})}\n\n"
//         for chunk in ai_stream():
//             yield f"event: chunk\ndata: {json.dumps({'text': chunk})}\n\n"
//         yield f"event: done\ndata: {json.dumps({'status': 'complete'})}\n\n"
//     return StreamingHttpResponse(generate(), content_type="text/event-stream")
