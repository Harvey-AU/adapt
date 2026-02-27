-- Host-aware crawling support for cross-subdomain discovery.

-- 1) Job-level toggle (default enabled).
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS allow_cross_subdomain_links BOOLEAN NOT NULL DEFAULT TRUE;

-- 2) Normalised host registry per parent domain.
CREATE TABLE IF NOT EXISTS domain_hosts (
  id BIGSERIAL PRIMARY KEY,
  domain_id INTEGER NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  host TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(domain_id, host)
);

-- 3) Persist host on pages/tasks to preserve exact crawl targets.
ALTER TABLE pages ADD COLUMN IF NOT EXISTS host TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS host TEXT;

-- Backfill pages.host from canonical domain name.
UPDATE pages p
SET host = d.name
FROM domains d
WHERE p.domain_id = d.id
  AND (p.host IS NULL OR p.host = '');

-- Backfill tasks.host from page host, then domain fallback.
UPDATE tasks t
SET host = COALESCE(p.host, d.name)
FROM pages p
JOIN domains d ON d.id = p.domain_id
WHERE t.page_id = p.id
  AND (t.host IS NULL OR t.host = '');

-- Enforce non-null host values.
ALTER TABLE pages ALTER COLUMN host SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN host SET NOT NULL;

-- Ensure uniqueness is host-aware.
ALTER TABLE pages DROP CONSTRAINT IF EXISTS pages_domain_id_path_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_domain_host_path_unique
  ON pages(domain_id, host, path);

-- Register currently known hosts as baseline in domain_hosts.
INSERT INTO domain_hosts (domain_id, host, is_primary)
SELECT d.id, d.name, TRUE
FROM domains d
ON CONFLICT (domain_id, host) DO UPDATE
SET is_primary = EXCLUDED.is_primary,
    last_seen_at = NOW();

INSERT INTO domain_hosts (domain_id, host, is_primary)
SELECT p.domain_id, p.host, FALSE
FROM pages p
ON CONFLICT (domain_id, host) DO UPDATE
SET last_seen_at = NOW();

-- Helpful lookup indexes.
CREATE INDEX IF NOT EXISTS idx_domain_hosts_domain_id
  ON domain_hosts(domain_id);

CREATE INDEX IF NOT EXISTS idx_tasks_job_host
  ON tasks(job_id, host);
