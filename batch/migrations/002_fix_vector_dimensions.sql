-- vector(1024) → vector(768) に修正
-- ruri-v3-310m の実際の次元数は768（310mはパラメータ数）
-- 既存データは次元数不一致で再利用不可のためdrop & add

ALTER TABLE rss_articles         DROP COLUMN IF EXISTS embedding;
ALTER TABLE rss_articles         ADD  COLUMN embedding vector(768);

ALTER TABLE articles             DROP COLUMN IF EXISTS embedding;
ALTER TABLE articles             ADD  COLUMN embedding vector(768);

ALTER TABLE feed_groups          DROP COLUMN IF EXISTS embedding;
ALTER TABLE feed_groups          ADD  COLUMN embedding vector(768);

ALTER TABLE compare_group_records DROP COLUMN IF EXISTS embedding;
ALTER TABLE compare_group_records ADD  COLUMN embedding vector(768);

ALTER TABLE youtube_videos       DROP COLUMN IF EXISTS embedding;
ALTER TABLE youtube_videos       ADD  COLUMN embedding vector(768);

ALTER TABLE compare_results      DROP COLUMN IF EXISTS embedding;
ALTER TABLE compare_results      ADD  COLUMN embedding vector(768);
