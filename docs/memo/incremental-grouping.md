## インクリメンタルニュースグループ化

既存グループをDBに保存し、新着記事はembedding類似検索で既存グループにマッチ → Ollamaは未知のイベントにのみ使う。

### テーブル設計

```prisma
model FeedGroup {
  id           String          @id @default(cuid())
  title        String
  articleCount Int             @default(0)
  lastSeenAt   DateTime        @default(now())
  createdAt    DateTime        @default(now())
  embedding    Unsupported("vector(768)")?
  items        FeedGroupItem[]
  @@index([lastSeenAt(sort: Desc)])
}

model FeedGroupItem {
  id          String    @id @default(cuid())
  group       FeedGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  groupId     String
  title       String
  url         String
  source      String
  publishedAt String?
  matchedAt   DateTime  @default(now())
  @@unique([groupId, url])
  @@index([url])
}
```

### embedding 戦略

- グループの embedding は所属記事のembedding平均（centroid）
- 増分更新: `new_centroid = (old_centroid * n + new_vec) / (n + 1)`
- `articleCount` でn管理

### フロー

1. 全記事タイトルをバッチembed（1回のOllama呼び出し）
2. 既存FeedGroupのembeddingをSELECTしてメモリに展開
3. アプリ側で全組合せのコサイン類似度を計算
4. 閾値超え → 既存グループに割り当て（lastSeenAt更新、centroid更新）
5. マッチなし → Ollamaで新規グループ化 → DB保存

### パラメータ

- 類似度閾値: 0.68（環境変数 `FEED_GROUP_SIMILARITY_THRESHOLD` で調整可能に）
- グループ有効期間: 検索対象は lastSeenAt 14日以内、30日以上でハード削除
- 記事数上限: 20件/グループ（超えたら新規グループとして分岐）
- 時間窓: publishedAt が7日以内の記事のみマッチ
