/**
 * @file hooks/useAutosave.js
 * @description Debounced autosave hook for a single document.
 *
 * Connects to the backend WebSocket on mount and sends save messages after a
 * 2-second debounce following each keystroke. Falls back to the REST PATCH
 * endpoint when the WebSocket is unavailable. Reconnects automatically with
 * exponential backoff capped at 30 seconds.
 *
 * The parent renders `<Editor key={docId} />` so this hook always mounts fresh
 * for each document — no need to handle document switching within the hook.
 *
 * @example
 *   const { save, status } = useAutosave(docId);
 *   // Call save(jsonString, wordCount) on every editor update.
 *   // status: 'idle' | 'saving' | 'saved' | 'offline'
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { updateDocumentContent } from '../api/projects.js';

/** Milliseconds after the last keystroke before a save is dispatched. */
const DEBOUNCE_MS        = 2000;

/** Maximum reconnect delay for exponential backoff (30 seconds). */
const MAX_RECONNECT_MS   = 30_000;

/** Initial reconnect delay after the first disconnect (1 second). */
const INITIAL_RECONNECT  = 1000;

/** Stop retrying WS after this many consecutive failures and fall back to REST. */
const MAX_WS_RETRIES     = 10;

/**
 * Build the WebSocket URL from the current window origin.
 * Uses wss:// in production (https://) and ws:// in development (http://).
 *
 * @returns {string} WebSocket URL (e.g., 'wss://app.example.com/ws')
 */
function buildWsUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

/**
 * Provides debounced autosave for a single document.
 * Sends over WebSocket; falls back to REST PATCH when the socket is unavailable.
 * Reconnects with exponential back-off (capped at 30 s).
 *
 * @param {number|null} docId  — the document to autosave; null disables the hook
 * @returns {{ save: (content: string, wordCount: number) => void, status: string }}
 *   status: 'idle' | 'saving' | 'saved' | 'offline'
 */
export function useAutosave(docId) {
  const [status, setStatus]     = useState('idle');

  // All WebSocket + timer state is stored in refs so changes don't trigger re-renders
  const wsRef                   = useRef(null);             // Active WebSocket instance
  const reconnectTimerRef       = useRef(null);             // Reconnect setTimeout handle
  const reconnectDelayRef       = useRef(INITIAL_RECONNECT); // Current backoff delay
  const pendingRef              = useRef(null);              // { content, wordCount } queued while disconnected
  const debounceRef             = useRef(null);              // Debounce setTimeout handle
  const docIdRef                = useRef(docId);             // Current docId without causing effect re-runs
  const mountedRef              = useRef(true);              // False after component unmounts
  const isConnectedRef          = useRef(false);             // True when WS is OPEN
  const retryCountRef           = useRef(0);                 // Consecutive failed WS attempts

  // Keep docIdRef in sync without triggering effect reruns
  useEffect(() => { docIdRef.current = docId; });

  // ── REST fallback ─────────────────────────────────────────────────────────

  const saveViaRest = useCallback(async (content, wordCount) => {
    const id = docIdRef.current;
    if (!id) return;
    try {
      setStatus('saving');
      await updateDocumentContent(id, content, wordCount);
      if (mountedRef.current) setStatus('saved');
    } catch {
      // Content is not lost — editor still holds it; next keystroke retries.
    }
  }, []);

  // ── Send save (WS or REST fallback) ──────────────────────────────────────

  const sendSave = useCallback((content, wordCount) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      setStatus('saving');
      ws.send(JSON.stringify({
        type:       'save',
        documentId: docIdRef.current,
        content,
        wordCount,
      }));
    } else {
      isConnectedRef.current = false;
      saveViaRest(content, wordCount);
    }
  }, [saveViaRest]);

  // ── Debounced public API ──────────────────────────────────────────────────

  const save = useCallback((content, wordCount) => {
    pendingRef.current = { content, wordCount };
    clearTimeout(debounceRef.current);
    // Clear any lingering 'saved' status so the indicator only shows 'saved'
    // after a genuine debounce + ACK cycle, never spuriously.
    setStatus(prev => prev !== 'offline' ? 'idle' : 'offline');
    debounceRef.current = setTimeout(() => {
      const p = pendingRef.current;
      if (p) {
        pendingRef.current = null;
        sendSave(p.content, p.wordCount);
      }
    }, DEBOUNCE_MS);
  }, [sendSave]);

  // ── WebSocket lifecycle ───────────────────────────────────────────────────

  useEffect(() => {
    if (!docId) return;

    mountedRef.current        = true;
    retryCountRef.current     = 0;
    reconnectDelayRef.current = INITIAL_RECONNECT;

    function connect() {
      const ws = new WebSocket(buildWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        isConnectedRef.current    = true;
        retryCountRef.current     = 0;            // reset on any successful connection
        reconnectDelayRef.current = INITIAL_RECONNECT; // reset back-off

        // Flush any pending save that accumulated while offline
        if (pendingRef.current) {
          clearTimeout(debounceRef.current);
          const p = pendingRef.current;
          pendingRef.current = null;
          sendSave(p.content, p.wordCount); // will set 'saving', then 'saved' on ACK
        } else {
          setStatus('saved'); // nothing pending — content is up-to-date
        }
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          if (msg.type === 'ping') {
            ws.send(JSON.stringify({ type: 'pong' }));
            return;
          }
          if (msg.type === 'ack' && mountedRef.current) {
            setStatus('saved');
          }
        } catch {
          // ignore malformed message
        }
      };

      ws.onerror = () => {
        isConnectedRef.current = false;
      };

      ws.onclose = () => {
        isConnectedRef.current = false;
        if (!mountedRef.current) return; // intentional teardown — don't reconnect

        retryCountRef.current++;
        if (retryCountRef.current >= MAX_WS_RETRIES) {
          // Retry ceiling reached — REST fallback handles all saves from here.
          if (mountedRef.current) setStatus('offline');
          return;
        }

        const delay = Math.min(reconnectDelayRef.current, MAX_RECONNECT_MS);
        reconnectDelayRef.current = Math.min(delay * 2, MAX_RECONNECT_MS);
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
    }

    // Delay the initial connection by 300 ms. Rapid scene switches cancel this
    // timer before any WebSocket is ever opened, eliminating the
    // connect-then-immediately-close ECONNRESET cycle in the Vite proxy.
    reconnectTimerRef.current = setTimeout(connect, 300);

    return () => {
      mountedRef.current = false;

      // Flush any pending debounced save before teardown (guards against rapid
      // scene switching where the 2-second debounce hasn't fired yet).
      // Use the closed-over `docId` — docIdRef.current may already point to the
      // newly active document by the time this cleanup runs.
      const pending = pendingRef.current;
      if (pending && docId) {
        pendingRef.current = null;
        updateDocumentContent(docId, pending.content, pending.wordCount).catch(() => {});
      }

      clearTimeout(debounceRef.current);
      clearTimeout(reconnectTimerRef.current);
      const ws = wsRef.current;
      if (ws) {
        ws.onclose = null; // suppress reconnect loop on intentional unmount
        ws.close();
      }
    };
  }, [docId, sendSave]);

  return { save, status };
}
