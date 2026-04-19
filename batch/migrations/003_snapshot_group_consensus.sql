-- snapshot_groups に報道ポイント別カバレッジフィールドを追加
-- 各ポイントはどのメディアが報じたかを保持する [{fact, sources[]}] 形式
ALTER TABLE snapshot_groups ADD COLUMN IF NOT EXISTS consensus_points JSONB;
