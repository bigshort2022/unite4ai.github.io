CREATE TABLE IF NOT EXISTS models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  license TEXT NOT NULL,
  maintainers TEXT NOT NULL,
  openness TEXT NOT NULL,
  openness_score INTEGER NOT NULL DEFAULT 0,
  artifacts TEXT NOT NULL DEFAULT '[]',
  inference TEXT,
  eval_bundle TEXT,
  tasks TEXT NOT NULL DEFAULT '[]',
  domains TEXT NOT NULL DEFAULT '[]',
  sdg_alignment TEXT NOT NULL DEFAULT '[]',
  community_led INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  updated TEXT NOT NULL,
  search_text TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  summary TEXT NOT NULL,
  license TEXT NOT NULL,
  maintainers TEXT NOT NULL,
  artifacts TEXT NOT NULL DEFAULT '[]',
  storage TEXT,
  domains TEXT NOT NULL DEFAULT '[]',
  sdg_alignment TEXT NOT NULL DEFAULT '[]',
  community_led INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0,
  updated TEXT NOT NULL,
  search_text TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_models_domains ON models(domains);
CREATE INDEX IF NOT EXISTS idx_models_openness ON models(openness_score);
CREATE INDEX IF NOT EXISTS idx_datasets_domains ON datasets(domains);
