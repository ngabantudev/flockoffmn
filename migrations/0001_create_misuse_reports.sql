-- Migration number: 0001 	 2026-07-21T23:14:38.194Z

CREATE TABLE misuse_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  source TEXT NOT NULL,
  published_at TEXT NOT NULL,
  city TEXT,
  state TEXT,
  lat REAL,
  lon REAL,
  department TEXT,
  discovered_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_misuse_reports_published_at ON misuse_reports(published_at);
