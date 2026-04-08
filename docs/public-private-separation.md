# Public / Private 分離設計

## 現状

まだ public / private 分離は実装していない。  
現在は単一の Next.js アプリに、公開UI候補と内部運用UIが同居している。

加えて、Go バッチは別プロセスとして存在する。

```text
[Browser]
   ↓
[Next.js]
   ├─ /ranking, /inspect, /compare, /youtube
   ├─ /api/batch/latest, /api/batch/history, /api/batch/run
   └─ /api/analyze, /api/rss, /api/compare/analyze ...
   ↓
[PostgreSQL]
   ↑
[Go Batch]
```

---

## 既に public 寄りの機能

次の機能は、将来的に public 側へ切り出しやすい。

- `/ranking`
- `GET /api/batch/latest`
- `GET /api/batch/history`
- カバレッジマトリクス
- snapshot 一覧・詳細表示

これらは主にスナップショットの読み取りで成立する。

---

## 既に internal 寄りの機能

次の機能は LLM や内部操作に依存しており、現状では internal 寄り。

- `POST /api/analyze`
- `POST /api/rss`
- `/compare`
- `/youtube`
- `/inspect`
- `POST /api/batch/run`
- Go バッチサーバー `:8090`

---

## 重要な現実

### 1. DB名は既に `snake_case`

複製対象や read-only ユーザー付与を考える時は、物理テーブル名は次を使う。

- `processed_snapshots`
- `snapshot_groups`
- `snapshot_group_items`
- `rss_articles`
- `articles`
- `compare_sessions`
- `compare_results`
- `compare_group_records`
- `youtube_videos`

### 2. 生SQL依存がある

Prisma だけでなく raw SQL もあるため、public 側を切る時は DB名の前提を合わせる必要がある。

### 3. Edge 前提ではない

現行の DB アクセスは `PrismaClient` + `@prisma/adapter-pg` + `pg` で動いている。  
そのまま「Edge Runtime で軽く動く」とはまだ言えない。

---

## 分離案

### Public

- snapshot 読み取り専用
- DB は read-only
- LLM 不要
- `/ranking` 相当の表示中心

### Internal

- 記事分析
- RSS取得
- compare
- youtube
- inspect
- batch run
- Go バッチ運用

---

## DB分離案

### 案A: read replica

public 側は snapshot 系だけ読む。

複製候補:

- `processed_snapshots`
- `snapshot_groups`
- `snapshot_group_items`

### 案B: 同一DBの read-only user

小規模ならこれでも足りる。

```sql
CREATE ROLE public_reader WITH LOGIN PASSWORD '***';
GRANT CONNECT ON DATABASE newsprism TO public_reader;
GRANT USAGE ON SCHEMA public TO public_reader;
GRANT SELECT ON processed_snapshots, snapshot_groups, snapshot_group_items TO public_reader;
```

---

## 現在の結論

- 分離構想自体は妥当
- ただしまだ実装していない
- 現時点で public に寄せやすいのは snapshot 読み取り系
- internal に残すべきものは LLM / batch 操作 / 点検UI
