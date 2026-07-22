-- Migration number: 0002 	 2026-07-22T00:00:00.000Z
--
-- location_precision: how confidently `lat`/`lon` were resolved.
--   "city"    - matched a specific city (unchanged from before this migration)
--   "state"   - only a bare state name was found; lat/lon point at the state capital
--   "unknown" - no location signal at all; lat/lon are the continental-US fallback
-- Existing rows already have a real city match (or are still NULL pending the
-- one-time backfill), so "city" is the correct default for them.
ALTER TABLE misuse_reports ADD COLUMN location_precision TEXT NOT NULL DEFAULT 'city';

-- Self-referencing: a row where cluster_id = id is canonical (the one the
-- map/API surface); a row where cluster_id points at a different id is a
-- duplicate of that canonical row (same incident, different outlet). Left
-- NULL on insert until the clustering pass in dedupeMisuseReports.ts runs,
-- so "needs clustering" is just `WHERE cluster_id IS NULL`.
ALTER TABLE misuse_reports ADD COLUMN cluster_id INTEGER;

CREATE INDEX idx_misuse_reports_cluster_id ON misuse_reports(cluster_id);
