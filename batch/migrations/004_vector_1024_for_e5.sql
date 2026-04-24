-- vector(768) → vector(1024): multilingual-e5-large-instruct の出力次元数に対応
-- 既存 embedding は次元数不一致で再利用不可のため drop & add

ALTER TABLE rss_articles         DROP COLUMN IF EXISTS embedding;
ALTER TABLE rss_articles         ADD  COLUMN embedding vector(1024);

-- embedding を消したので embedded_at / classified_at もリセットし再処理対象にする
UPDATE rss_articles SET embedded_at = NULL, classified_at = NULL WHERE embedded_at IS NOT NULL;

ALTER TABLE articles             DROP COLUMN IF EXISTS embedding;
ALTER TABLE articles             ADD  COLUMN embedding vector(1024);

ALTER TABLE feed_groups          DROP COLUMN IF EXISTS embedding;
ALTER TABLE feed_groups          ADD  COLUMN embedding vector(1024);

ALTER TABLE compare_group_records DROP COLUMN IF EXISTS embedding;
ALTER TABLE compare_group_records ADD  COLUMN embedding vector(1024);

ALTER TABLE youtube_videos       DROP COLUMN IF EXISTS embedding;
ALTER TABLE youtube_videos       ADD  COLUMN embedding vector(1024);

ALTER TABLE compare_results      DROP COLUMN IF EXISTS embedding;
ALTER TABLE compare_results      ADD  COLUMN embedding vector(1024);
