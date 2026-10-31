-- Schema for the E2E Tester task store (server/db.js).
CREATE TABLE IF NOT EXISTS tasks (
  id         TEXT PRIMARY KEY,
  name       TEXT,
  prompt     TEXT,
  status     TEXT,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS tasks_created_at_idx ON tasks (created_at DESC);
