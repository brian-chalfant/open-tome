// ============================================================
// pmContent.js
// ============================================================
// Purpose:   Shared helpers for handling stored ProseMirror JSON content.
// Used by:   db/documentDb.js (word counting), routes/compile.js (PDF + ePub)
// Exports:   safeParseContent
// Notes:     Document content is stored in the documents.content column as a
//            JSON string. Three call sites used to repeat the same defensive
//            try/JSON.parse/catch IIFE inline. Centralising it here keeps
//            their null-fallback behaviour identical and easy to evolve.
// ============================================================

// Safely JSON-parse a stored ProseMirror content string.
// Returns null for empty input or any parse error — never throws.
// Callers downstream pass the parsed tree through pmToHtml or extractText,
// both of which already handle a null/empty node by emitting nothing.
export function safeParseContent(content) {
  if (!content) return null;
  try { return JSON.parse(content); } catch { return null; }
}
