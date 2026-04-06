-- RssArticle に embeddedAt / classifiedAt を追加
ALTER TABLE "RssArticle" ADD COLUMN IF NOT EXISTS "embeddedAt"   TIMESTAMPTZ;
ALTER TABLE "RssArticle" ADD COLUMN IF NOT EXISTS "classifiedAt" TIMESTAMPTZ;

-- ProcessedSnapshot: バッチ実行ごとの結果スナップショット
CREATE TABLE IF NOT EXISTS "ProcessedSnapshot" (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "processedAt"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "articleCount" INT NOT NULL,
  "groupCount"   INT NOT NULL,
  "durationMs"   INT NOT NULL,
  status         TEXT NOT NULL,
  error          TEXT
);
CREATE INDEX IF NOT EXISTS idx_snapshot_processed ON "ProcessedSnapshot" ("processedAt" DESC);

-- SnapshotGroup: スナップショット内のニュースグループ
CREATE TABLE IF NOT EXISTS "SnapshotGroup" (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "snapshotId"   TEXT NOT NULL REFERENCES "ProcessedSnapshot"(id) ON DELETE CASCADE,
  "groupTitle"   TEXT NOT NULL,
  category       TEXT,
  subcategory    TEXT,
  rank           INT NOT NULL,
  "singleOutlet" BOOLEAN NOT NULL,
  "coveredBy"    JSONB,
  "silentMedia"  JSONB
);
CREATE INDEX IF NOT EXISTS idx_sg_snapshot ON "SnapshotGroup" ("snapshotId");

-- SnapshotGroupItem: グループ内の記事
CREATE TABLE IF NOT EXISTS "SnapshotGroupItem" (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "groupId"     TEXT NOT NULL REFERENCES "SnapshotGroup"(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  url           TEXT NOT NULL,
  source        TEXT NOT NULL,
  summary       TEXT,
  "publishedAt" TEXT,
  category      TEXT,
  subcategory   TEXT
);
CREATE INDEX IF NOT EXISTS idx_sgi_group ON "SnapshotGroupItem" ("groupId");
