-- rss_articles に embedded_at / classified_at を追加
ALTER TABLE rss_articles ADD COLUMN IF NOT EXISTS embedded_at   TIMESTAMPTZ;
ALTER TABLE rss_articles ADD COLUMN IF NOT EXISTS classified_at TIMESTAMPTZ;

-- processed_snapshots: バッチ実行ごとの結果スナップショット
CREATE TABLE IF NOT EXISTS processed_snapshots (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  processed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  article_count  INT NOT NULL,
  group_count    INT NOT NULL,
  duration_ms    INT NOT NULL,
  status         TEXT NOT NULL,
  error          TEXT
);
CREATE INDEX IF NOT EXISTS idx_snapshot_processed ON processed_snapshots (processed_at DESC);

-- snapshot_groups: スナップショット内のニュースグループ
CREATE TABLE IF NOT EXISTS snapshot_groups (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  snapshot_id    TEXT NOT NULL REFERENCES processed_snapshots(id) ON DELETE CASCADE,
  group_title    TEXT NOT NULL,
  category       TEXT,
  subcategory    TEXT,
  rank           INT NOT NULL,
  single_outlet  BOOLEAN NOT NULL,
  covered_by     JSONB,
  silent_media   JSONB
);
CREATE INDEX IF NOT EXISTS idx_sg_snapshot ON snapshot_groups (snapshot_id);

-- snapshot_group_items: グループ内の記事
CREATE TABLE IF NOT EXISTS snapshot_group_items (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  group_id      TEXT NOT NULL REFERENCES snapshot_groups(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  url           TEXT NOT NULL,
  source        TEXT NOT NULL,
  summary       TEXT,
  published_at  TEXT,
  category      TEXT,
  subcategory   TEXT
);
CREATE INDEX IF NOT EXISTS idx_sgi_group ON snapshot_group_items (group_id);
