-- Preview hotfix for host-aware crawl schema drift.
-- Idempotent and safe to run after prior migrations.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS allow_cross_subdomain_links BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS domain_hosts (
  id BIGSERIAL PRIMARY KEY,
  domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  host TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (domain_id, host)
);

ALTER TABLE pages ADD COLUMN IF NOT EXISTS host TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS host TEXT;

UPDATE pages p
SET host = d.name
FROM domains d
WHERE p.domain_id = d.id
  AND (p.host IS NULL OR p.host = '');

UPDATE tasks t
SET host = COALESCE(t.host, p.host, d.name)
FROM pages p
JOIN domains d ON d.id = p.domain_id
WHERE t.page_id = p.id
  AND (t.host IS NULL OR t.host = '');

UPDATE tasks t
SET host = d.name
FROM jobs j
JOIN domains d ON d.id = j.domain_id
WHERE t.job_id = j.id
  AND (t.host IS NULL OR t.host = '');

ALTER TABLE pages ALTER COLUMN host SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN host SET NOT NULL;

ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_domain_id_path_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_domain_host_path_unique
  ON pages (domain_id, host, path);

CREATE INDEX IF NOT EXISTS idx_domain_hosts_domain_id
  ON domain_hosts (domain_id);

CREATE INDEX IF NOT EXISTS idx_tasks_job_host
  ON tasks (job_id, host);

INSERT INTO domain_hosts (domain_id, host, is_primary)
SELECT d.id, d.name, TRUE
FROM domains d
ON CONFLICT (domain_id, host) DO UPDATE
SET is_primary = EXCLUDED.is_primary,
    last_seen_at = NOW();

INSERT INTO domain_hosts (domain_id, host, is_primary)
SELECT p.domain_id, p.host, FALSE
FROM pages p
WHERE p.host IS NOT NULL AND p.host <> ''
ON CONFLICT (domain_id, host) DO UPDATE
SET last_seen_at = NOW();
