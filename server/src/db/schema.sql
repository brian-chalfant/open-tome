-- =============================================================================
-- schema.sql — tome-app PostgreSQL Database Schema
-- =============================================================================
-- All table definitions use CREATE TABLE IF NOT EXISTS so that this file can be
-- executed on every app startup without affecting existing data (idempotent).
--
-- Timestamps: All timestamps are TIMESTAMPTZ columns with DEFAULT NOW().
-- PostgreSQL returns these as JavaScript Date objects via the `pg` driver.
--
-- ON DELETE CASCADE: Child rows are automatically removed when the parent is
-- deleted. PostgreSQL enforces foreign key constraints by default (unlike SQLite
-- which requires PRAGMA foreign_keys = ON).
-- =============================================================================

-- ── Users ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL UNIQUE,
  display_name  TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,
  is_admin      BOOLEAN     NOT NULL DEFAULT FALSE,
  avatar_url    TEXT,
  token_version INTEGER     NOT NULL DEFAULT 0,
  theme         TEXT        NOT NULL DEFAULT 'light' CHECK(theme IN ('light','dark','tome')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Projects ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id         SERIAL PRIMARY KEY,
  user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  archived   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived      BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS target_words INTEGER DEFAULT NULL;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS deadline     DATE    DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

-- ── Documents ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id         SERIAL PRIMARY KEY,
  project_id INTEGER     NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  parent_id  INTEGER              REFERENCES documents(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL DEFAULT 'Untitled',
  type       TEXT        NOT NULL DEFAULT 'scene'
                         CHECK(type IN ('scene','folder','chapter','research','character')),
  content    TEXT,
  word_count INTEGER     NOT NULL DEFAULT 0,
  sort_order INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_documents_tree
  ON documents(project_id, parent_id, sort_order);

-- ── Notes ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notes (
  id          SERIAL PRIMARY KEY,
  project_id  INTEGER     NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  document_id INTEGER              REFERENCES documents(id) ON DELETE SET NULL,
  type        TEXT        NOT NULL CHECK(type IN ('character','research')),
  title       TEXT        NOT NULL DEFAULT 'Untitled',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_id, user_id, type);
ALTER TABLE notes ADD COLUMN IF NOT EXISTS source_doc_id INTEGER REFERENCES documents(id) ON DELETE SET NULL;

-- ── Note Fields ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS note_fields (
  id          SERIAL PRIMARY KEY,
  note_id     INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  field_name  TEXT    NOT NULL,
  field_value TEXT    NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

-- ── Labels ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS labels (
  id         SERIAL      PRIMARY KEY,
  project_id INTEGER     NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#94a3b8',
  sort_order INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_labels_project ON labels(project_id, user_id);

-- ── Document Statuses ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS doc_statuses (
  id         SERIAL      PRIMARY KEY,
  project_id INTEGER     NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#94a3b8',
  sort_order INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_doc_statuses_project ON doc_statuses(project_id, user_id);

-- ── Label / Status columns on documents ──────────────────────────────────────
ALTER TABLE documents ADD COLUMN IF NOT EXISTS label_id  INTEGER REFERENCES labels(id)      ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS status_id INTEGER REFERENCES doc_statuses(id) ON DELETE SET NULL;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS synopsis  TEXT    NOT NULL DEFAULT '';

-- ── Manuscript author / contact info ─────────────────────────────────────────
-- Stored once on the user profile — used to populate the title page when
-- exporting in Standard Manuscript Format (Manuscript DOCX).
ALTER TABLE users ADD COLUMN IF NOT EXISTS ms_legal_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ms_pen_name   TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ms_address    TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ms_phone      TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS ms_email      TEXT;

-- ── Daily Writing Statistics ──────────────────────────────────────────────────
-- Accumulates words written per user per UTC day.
-- Populated at save time via positive word-count deltas.
-- words_added is always >= 0 — deletions/pruning are not subtracted.
CREATE TABLE IF NOT EXISTS daily_stats (
  id          SERIAL      PRIMARY KEY,
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stat_date   DATE        NOT NULL DEFAULT CURRENT_DATE,
  words_added INTEGER     NOT NULL DEFAULT 0,
  UNIQUE(user_id, stat_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_user_date
  ON daily_stats(user_id, stat_date DESC);

-- ── Add chapter document type ─────────────────────────────────────────────────
-- Drops and re-adds the CHECK constraint so 'chapter' is a valid document type.
-- Existing rows contain no 'chapter' values so ADD CONSTRAINT succeeds on any
-- live database. Two DROP statements handle both naming conventions:
-- PostgreSQL auto-names it "documents_type_check" and
-- pg-mem (used in tests) auto-names it "documents_constraint_1".
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_type_check;
ALTER TABLE documents DROP CONSTRAINT IF EXISTS documents_constraint_1;
ALTER TABLE documents ADD CONSTRAINT documents_type_check
  CHECK(type IN ('scene','folder','chapter','research','character'));

-- ── Invite tokens ────────────────────────────────────────────────────────────
-- Single-use tokens generated by admins to allow new user registration.
-- First user to register is automatically an admin and needs no token.
CREATE TABLE IF NOT EXISTS invite_tokens (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  token       TEXT        NOT NULL UNIQUE,
  created_by  UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  used_at     TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days')
);

-- ── Theme: add 'tome' option ──────────────────────────────────────────────────
-- Drops and re-adds the CHECK constraint so 'tome' is a valid theme value.
-- Two DROP statements handle PostgreSQL's auto-name ("users_theme_check") and
-- the pg-mem test runner name ("users_constraint_1").
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_theme_check;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_constraint_1;
ALTER TABLE users ADD CONSTRAINT users_theme_check
  CHECK(theme IN ('light', 'dark', 'tome'));

-- ── Supplementary indexes ────────────────────────────────────────────────────
-- documents.user_id: standalone filter for cross-project ownership checks and
-- account-delete cascades. The existing idx_documents_tree leads with project_id
-- and is not selective for user_id-only queries.
CREATE INDEX IF NOT EXISTS idx_documents_user        ON documents(user_id);
-- notes.document_id: looking up notes attached to a specific document (UI badge);
-- not covered by the existing (project_id, user_id, type) composite index.
CREATE INDEX IF NOT EXISTS idx_notes_document        ON notes(document_id);
-- note_fields.note_id: every note read joins fields by note_id. PostgreSQL
-- does not auto-index foreign keys.
CREATE INDEX IF NOT EXISTS idx_note_fields_note      ON note_fields(note_id);

