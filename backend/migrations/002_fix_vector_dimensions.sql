-- vector(1024) → vector(768) に修正
-- ruri-v3-310m の実際の次元数は768（310mはパラメータ数）
-- 既存データは次元数不一致で再利用不可のためdrop & add

ALTER TABLE "RssArticle"        DROP COLUMN IF EXISTS embedding;
ALTER TABLE "RssArticle"        ADD  COLUMN embedding vector(768);

ALTER TABLE "Article"           DROP COLUMN IF EXISTS embedding;
ALTER TABLE "Article"           ADD  COLUMN embedding vector(768);

ALTER TABLE "FeedGroup"         DROP COLUMN IF EXISTS embedding;
ALTER TABLE "FeedGroup"         ADD  COLUMN embedding vector(768);

ALTER TABLE "CompareGroupRecord" DROP COLUMN IF EXISTS embedding;
ALTER TABLE "CompareGroupRecord" ADD  COLUMN embedding vector(768);

ALTER TABLE "YouTubeVideo"      DROP COLUMN IF EXISTS embedding;
ALTER TABLE "YouTubeVideo"      ADD  COLUMN embedding vector(768);

ALTER TABLE "CompareResult"     DROP COLUMN IF EXISTS embedding;
ALTER TABLE "CompareResult"     ADD  COLUMN embedding vector(768);
