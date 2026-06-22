/**
 * @file websocket.js
 * @description WebSocket server for real-time document autosave.
 *
 * Architecture:
 *  - `attachWebSocketServer(httpServer)` hooks into the existing HTTP server's
 *    'upgrade' event. This lets us share a single TCP port (3001) between
 *    Express (HTTP) and the WS server.
 *  - Authentication is performed at the HTTP upgrade step — before the WS
 *    handshake completes — so unauthenticated clients never get a socket.
 *  - The server speaks a simple JSON message protocol:
 *      Client → Server:  { type: 'save', documentId, content, wordCount }
 *      Server → Client:  { type: 'ack', documentId, savedAt }   (on success)
 *                        { type: 'ping' }                        (heartbeat)
 *                        { type: 'error', documentId, error }   (on failure)
 *      Client → Server:  { type: 'pong' }                       (heartbeat reply)
 *  - A 30-second heartbeat timer terminates clients that stop responding.
 *
 * Security:
 *  - JWT is read from the HttpOnly access_token cookie on the HTTP upgrade
 *    request. Tokens are NEVER passed in URL query strings (they'd appear in logs).
 *  - Ownership of documentId is validated on every save message.
 *  - Payload size is capped server-side via maxPayload and in handleSave.
 */

import { WebSocketServer }  from 'ws';
import jwt                   from 'jsonwebtoken';
import { getDb }             from './db/migrate.js';
import { getUserById }       from './db/userDb.js';
import { findDocument, updateDocumentContent } from './db/documentDb.js';
import { recordDelta }       from './db/analyticsDb.js';
import logger                from './logger.js';

/** Maximum allowed message payload in bytes (1 MB). */
const MAX_PAYLOAD = 1024 * 1024;

/** Interval in milliseconds between heartbeat pings (30 seconds). */
const HEARTBEAT_INTERVAL = 30_000;

// ── Cookie parser ─────────────────────────────────────────────────────────────
// A minimal, dependency-free cookie parser used only during the WS upgrade.
// The npm `cookie` package is not imported here to keep the WS module lean.

/**
 * Parse a raw Cookie header string into a key/value object.
 *
 * @param {string|undefined} cookieHeader - The raw value of the Cookie HTTP header.
 * @returns {Record<string, string>} Plain object mapping cookie name → decoded value.
 */
function parseCookies(cookieHeader) {
  const result = {};
  if (!cookieHeader) return result;

  // Each cookie is separated by '; ' in the header value
  for (const pair of cookieHeader.split(';')) {
    const eq = pair.indexOf('=');    // Position of the '=' separator
    if (eq < 0) continue;            // Skip malformed entries with no '='

    const key = pair.slice(0, eq).trim();
    try {
      // URL-decode the value (cookie values may be percent-encoded)
      result[key] = decodeURIComponent(pair.slice(eq + 1).trim());
    } catch {
      // If decoding fails, store the raw value rather than dropping the cookie
      result[key] = pair.slice(eq + 1).trim();
    }
  }
  return result;
}

// ── WebSocket authentication ──────────────────────────────────────────────────

/**
 * Authenticate a WebSocket upgrade request using the JWT session cookie.
 *
 * Reads the tome_token httpOnly cookie from the upgrade request headers,
 * verifies the JWT, and checks token_version against the DB to detect revoked sessions.
 *
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<object | null>}
 */
async function authenticateUpgrade(req) {
  try {
    const cookies = parseCookies(req.headers.cookie ?? '');

    // ── Test bypass ──────────────────────────────────────────────────────────
    if (process.env.NODE_ENV === 'test') {
      const addr = req.socket?.remoteAddress ?? '';
      if (addr !== '127.0.0.1' && addr !== '::1' && addr !== '::ffff:127.0.0.1') return null;
      const testUserId = cookies['x-test-user-id'];
      if (testUserId) return getUserById(getDb(), testUserId);
      return null;
    }

    // ── JWT cookie validation ────────────────────────────────────────────────
    const token = cookies['tome_token'];
    if (!token) return null;

    const secret = process.env.JWT_SECRET;
    if (!secret) return null;

    const payload = jwt.verify(token, secret);
    const user = await getUserById(getDb(), payload.sub);
    if (!user || user.token_version !== payload.tv) return null;
    return user;
  } catch (err) {
    logger.warn({ err: err.message }, 'ws authenticateUpgrade failed');
    return null;
  }
}

// ── Message helpers ───────────────────────────────────────────────────────────

/**
 * Safely send a JSON string to a WebSocket client, guarding against errors
 * that can occur if the socket closes between the readyState check and send().
 *
 * @param {import('ws').WebSocket} ws      - The target WebSocket connection.
 * @param {string}                 payload - Pre-serialized JSON string to send.
 */
function safeSend(ws, payload) {
  if (ws.readyState !== ws.OPEN) return;
  try {
    ws.send(payload, (err) => {
      if (err) logger.warn({ uid: ws.user?.id ?? null, err: err.message }, 'ws send error');
    });
  } catch (err) {
    logger.warn({ uid: ws.user?.id ?? null, err: err.message }, 'ws send error');
  }
}

/**
 * Handle an incoming { type: 'save' } message from a client.
 *
 * Validates:
 *  1. documentId is a positive integer.
 *  2. content length is within MAX_PAYLOAD (belt-and-suspenders on top of server maxPayload).
 *  3. The document exists and belongs to the authenticated user (IDOR prevention).
 *
 * On success, persists content + word count and sends an { type: 'ack' } reply.
 *
 * @param {import('ws').WebSocket} ws          - The sending client's socket.
 * @param {{ documentId: unknown, content: unknown, wordCount: unknown }} msg - Parsed message body.
 */
async function handleSave(ws, { documentId, content, wordCount }) {
  // Reject non-integer or non-positive document IDs
  if (!Number.isInteger(documentId) || documentId <= 0) return;

  // Reject non-string content (null is allowed to clear a document; other types are not)
  if (content !== null && typeof content !== 'string') {
    safeSend(ws, JSON.stringify({ type: 'error', documentId, error: 'Invalid content type' }));
    return;
  }

  // Belt-and-suspenders content size check
  if (typeof content === 'string' && content.length > MAX_PAYLOAD) {
    safeSend(ws, JSON.stringify({ type: 'error', documentId, error: 'Payload too large' }));
    return;
  }

  const db  = getDb();
  const doc = await findDocument(db, documentId);

  // Ownership check — the authenticated user must own the document
  if (!doc || doc.user_id !== ws.user.id) {
    safeSend(ws, JSON.stringify({ type: 'error', documentId, error: 'Forbidden' }));
    return;
  }

  const safeWords = (typeof wordCount === 'number' && Number.isFinite(wordCount))
    ? Math.max(0, Math.floor(wordCount))
    : 0;

  await updateDocumentContent(db, documentId, content ?? null, safeWords);
  recordDelta(db, ws.user.id, doc.word_count, safeWords).catch(() => {});

  safeSend(ws, JSON.stringify({
    type:    'ack',
    documentId,
    savedAt: new Date().toISOString(),
  }));
}

/**
 * Dispatch an incoming raw WebSocket message to the appropriate handler.
 * Silently ignores malformed JSON and unknown message types.
 *
 * @param {import('ws').WebSocket} ws      - The sending client's socket.
 * @param {Buffer|string}          rawData - Raw message data from the 'message' event.
 */
function handleMessage(ws, rawData) {
  let msg;
  try {
    // All messages are text frames; decode from UTF-8 buffer
    msg = JSON.parse(rawData.toString('utf8'));
  } catch {
    return; // Silently discard malformed JSON — do not disconnect the client
  }

  // Application-level pong — sent in response to our { type: 'ping' } heartbeat.
  // Using JSON data frames (not WS protocol ping/pong control frames) because
  // control frames are often swallowed by Vite's dev proxy.
  if (msg.type === 'pong') { ws.isAlive = true; return; }

  if (msg.type === 'save') {
    const now = Date.now();
    if (!ws._rateBucket) ws._rateBucket = { count: 0, windowStart: now };
    if (now - ws._rateBucket.windowStart > 5000) {
      ws._rateBucket = { count: 0, windowStart: now };
    }
    ws._rateBucket.count++;
    if (ws._rateBucket.count > 10) {
      safeSend(ws, JSON.stringify({ type: 'error', error: 'rate_limited' }));
      return;
    }
    handleSave(ws, msg).catch((err) => {
      logger.error({ uid: ws.user?.id ?? null, err: err.message }, 'ws save error');
    });
  }
  // All other message types are silently ignored
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Create a WebSocket server and attach it to an existing HTTP server.
 *
 * The WS server operates in `noServer` mode — it does NOT listen on its own
 * port. Instead it processes upgrade requests that our 'upgrade' event handler
 * explicitly passes through after authentication succeeds.
 *
 * @param {import('http').Server} httpServer - The Express http.Server instance.
 * @returns {import('ws').WebSocketServer}   - The configured WS server (for testing).
 */
export function attachWebSocketServer(httpServer) {
  // noServer: true — we drive the upgrade event manually so we can reject
  // unauthenticated clients at the HTTP layer (before the WS handshake).
  // maxPayload enforces a hard cap on incoming frame size.
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD });

  // ── HTTP upgrade interception ─────────────────────────────────────────────
  httpServer.on('upgrade', (req, socket, head) => {
    // Only handle WebSocket upgrades on the /ws path.
    if (req.url !== '/ws') {
      socket.on('error', () => {});
      socket.destroy();
      return;
    }

    // Authenticate before completing the handshake (async — awaited here)
    authenticateUpgrade(req).then((user) => {
      if (!user) {
        socket.on('error', () => {});
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      try {
        wss.handleUpgrade(req, socket, head, (ws) => {
          ws.user    = user;
          ws.isAlive = true;
          wss.emit('connection', ws, req);
        });
      } catch (err) {
        logger.warn({ err: err.message }, 'ws handleUpgrade error');
        socket.on('error', () => {});
        socket.destroy();
      }
    }).catch((err) => {
      logger.warn({ err: err.message }, 'ws authenticateUpgrade error');
      socket.on('error', () => {});
      socket.destroy();
    });
  });

  // ── Connection lifecycle ──────────────────────────────────────────────────
  wss.on('connection', (ws) => {
    // Route incoming messages to handleMessage()
    ws.on('message', (data, isBinary) => {
      if (isBinary) return; // We only accept text frames (JSON)
      handleMessage(ws, data);
    });

    ws.on('error', (err) => {
      // Log error metadata only — never log message content
      logger.error({ uid: ws.user?.id ?? null, err: err.message }, 'ws client error');
    });
  });

  wss.on('error', (err) => {
    logger.error({ err: err.message }, 'wss server error');
  });

  // ── Heartbeat timer ───────────────────────────────────────────────────────
  // Every HEARTBEAT_INTERVAL ms, send a JSON { type: 'ping' } to every client.
  // Clients that do not respond with { type: 'pong' } before the next tick are
  // terminated — this cleans up zombie connections (e.g., browser tab closed
  // without a clean TCP FIN).
  //
  // Using JSON data frames instead of WS protocol ping/pong control frames
  // because control frames are often stripped by Vite's dev proxy.
  const heartbeatTimer = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        // Client did not respond to the previous ping — terminate the connection
        try { ws.terminate(); } catch (err) {
          logger.warn({ uid: ws.user?.id ?? null, err: err.message }, 'ws terminate error');
        }
        return;
      }

      // Reset the liveness flag; the client's { type: 'pong' } will set it back to true
      ws.isAlive = false;
      safeSend(ws, JSON.stringify({ type: 'ping' }));
    });
  }, HEARTBEAT_INTERVAL);

  // Clean up the timer when the WS server shuts down to avoid keeping the
  // Node.js event loop alive after all connections have closed.
  wss.on('close', () => clearInterval(heartbeatTimer));

  return wss;
}
