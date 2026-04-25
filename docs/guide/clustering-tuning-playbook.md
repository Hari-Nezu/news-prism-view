# クラスタリング精度改善プレイブック

## 前提: 現在のパイプライン構成

```
記事収集 → Embedding(ruri-v3) → 分類 → グルーピング → LLM精査(refine) → 命名 → コンセンサス → 保存
```

グルーピングは2方式が切替可能:
- **Greedy Cosine** (`group.go`): 768次元のまま貪欲法。閾値 `GROUP_CLUSTER_THRESHOLD`
- **BERTopic** (`bertopic_cluster.py`): UMAP次元削減 → HDBSCAN密度クラスタリング。`USE_BERTOPIC=true` で有効化

---

## 1. 改善ループの概要

```
① ログ取得 → ② 問題分類 → ③ 仮説立て → ④ パラメータ変更 → ⑤ 再実行 → ⑥ 比較評価
     ↑                                                                      |
     └──────────────────────────────────────────────────────────────────────┘
```

1回のループで**1つのパラメータだけ**変更する。複数同時に変えると因果が追えない。

---

## 2. ログ取得と現状把握

### 2.1 グループログの確認

バッチ実行ごとに `batch/logs/group_YYYYMMDD_HHMMSS.json` が出力される。

```bash
# 最新ログの統計サマリー
cat batch/logs/group_$(ls -t batch/logs/ | head -1) | python3 -c "
import json, sys
d = json.load(sys.stdin)
total = sum(e['size'] for e in d)
multi = [e for e in d if e['size'] >= 2]
noise = [e for e in d if e['size'] == 1]
print(f'articles: {total}')
print(f'clusters: {len(d)} (multi: {len(multi)}, single: {len(noise)})')
print(f'noise rate: {len(noise)/len(d)*100:.1f}%')
if multi:
    sims = [e['avg_similarity'] for e in multi]
    sims.sort()
    n = len(sims)
    print(f'avg_similarity p10={sims[int(0.1*(n-1))]:.4f} p50={sims[n//2]:.4f} p90={sims[int(0.9*(n-1))]:.4f}')
# サイズ分布
sizes = {}
for e in d:
    sizes[e['size']] = sizes.get(e['size'], 0) + 1
print('size distribution:', dict(sorted(sizes.items())))
"
```

### 2.2 注目すべき指標

| 指標 | 目安 | 意味 |
|:--|:--|:--|
| noise rate (単独記事率) | < 25% | 高すぎると有効なクラスタを見逃している |
| 最大クラスタサイズ | < 30 | 大きすぎると異なるトピックが混在している可能性 |
| size 2-3 のクラスタ数 | 0でない | 0なら min_cluster_size が高すぎる (BERTopic) |
| avg_similarity p10 | > 0.90 | 低いクラスタは内部不一致の疑い |

### 2.3 /inspect ページでの目視確認

`/inspect` → snapshot タブで個別グループを展開し、以下を確認:
- 明らかに異なるトピックの記事が混在していないか（過合流）
- 同じトピックの記事が別グループに分かれていないか（過分離）
- recompute で `alternativeClusters` の類似度が高い記事がないか

---

## 3. 問題パターンと対応

### パターンA: 過合流（異なるトピックが1つのクラスタに）

**症状**: 大きなクラスタに無関係な記事が混入

**確認方法**:
```bash
# サイズ20以上のクラスタのタイトル一覧
cat batch/logs/group_*.json | python3 -c "
import json, sys
d = json.load(sys.stdin)
for e in d:
    if e['size'] >= 20:
        print(f'--- cluster {e[\"index\"]} (size={e[\"size\"]}, sim={e[\"avg_similarity\"]:.4f}) ---')
        for a in e['articles']:
            print(f'  [{a[\"source\"]}] {a[\"title\"]}')
        print()
" | less
```

**対策（優先順）**:
1. Greedy: `GROUP_CLUSTER_THRESHOLD` を上げる（0.91 → 0.92 など）
2. BERTopic: `BERTOPIC_MIN_CLUSTER_SIZE` を上げる / `BERTOPIC_UMAP_COMPONENTS` を調整
3. Refine: `REFINE_INTRA_THRESHOLD` を上げてsplit判定を厳しくする

### パターンB: 過分離（同じトピックが複数クラスタに）

**症状**: 同一ニュースが2つ以上のグループに分かれる

**確認方法**:
`/inspect` でグループを展開 → recompute → `alternativeClusters` で他グループへの類似度が 0.90+ なら過分離の疑い

**対策（優先順）**:
1. Greedy: `GROUP_CLUSTER_THRESHOLD` を下げる
2. BERTopic: `BERTOPIC_MIN_CLUSTER_SIZE` を下げる（4 → 3 or 2）
3. Refine: `REFINE_INTER_THRESHOLD` を下げてmerge判定を積極化

### パターンC: ノイズ過多（単独クラスタが多すぎる）

**症状**: 本来グループ化されるべき記事が単独に

**確認方法**: noise rate が 25% を大きく超える

**対策**:
1. BERTopic: `BERTOPIC_MIN_CLUSTER_SIZE` を下げる（**最も効果大**）
2. Greedy: `GROUP_CLUSTER_THRESHOLD` を下げる
3. BERTopic: `UMAP n_neighbors` をコード内で調整（現在15固定）

### パターンD: Embeddingレベルの問題

**症状**: 類似度の数値は妥当なのに、人間の判断と乖離

**確認方法**: `/inspect` の recompute で `nearestNeighbors` を見て、意味的に近い記事が上位に来ているか確認

**対策**: Embeddingモデルの変更が必要。クラスタリングパラメータでは対処不可。

---

## 4. パラメータ一覧と調整ガイド

### Greedy Cosine（`USE_BERTOPIC=false`）

| 環境変数 | デフォルト | 効果 |
|:--|:--|:--|
| `GROUP_CLUSTER_THRESHOLD` | 0.91 | 上げる→クラスタ分裂しやすい、下げる→合流しやすい |

### BERTopic（`USE_BERTOPIC=true`）

| 環境変数 | デフォルト | 効果 |
|:--|:--|:--|
| `BERTOPIC_MIN_CLUSTER_SIZE` | 4 | **最重要**。下げる→小クラスタ許容でノイズ減、上げる→大クラスタのみ |
| `BERTOPIC_UMAP_COMPONENTS` | 15 | 次元数。下げる→構造圧縮強、上げる→詳細保持 |

UMAP の `n_neighbors`（現在15固定）と `min_dist`（現在0.0固定）はコード変更が必要:
- `n_neighbors`: 上げる→大域構造重視、下げる→局所構造重視
- `min_dist`: 0.0が密クラスタ向き。上げると散らばる

### Refine（LLM精査）

| 環境変数 | デフォルト | 効果 |
|:--|:--|:--|
| `REFINE_INTRA_THRESHOLD` | 0.93 | クラスタ内min類似度がこれ未満→split候補としてLLMに送る |
| `REFINE_INTER_THRESHOLD` | 0.92 | クラスタ間centroid類似度がこれ以上→merge候補としてLLMに送る |
| `SKIP_REFINE` | false | trueでrefineステップ全体をスキップ |

---

## 5. 比較評価の手順

### 5.1 A/B比較スクリプト

2つのログファイルを比較する:

```bash
# 使い方: python3 scripts/compare_clusters.py batch/logs/before.json batch/logs/after.json
# （存在しない場合は以下のワンライナーで代用）

diff <(
  cat batch/logs/BEFORE.json | python3 -c "
import json,sys
d=json.load(sys.stdin)
for e in sorted(d, key=lambda x: -x['size']):
    if e['size']>=2:
        titles=', '.join(a['title'][:30] for a in e['articles'][:5])
        print(f'[{e[\"size\"]}] {titles}')
"
) <(
  cat batch/logs/AFTER.json | python3 -c "
import json,sys
d=json.load(sys.stdin)
for e in sorted(d, key=lambda x: -x['size']):
    if e['size']>=2:
        titles=', '.join(a['title'][:30] for a in e['articles'][:5])
        print(f'[{e[\"size\"]}] {titles}')
"
)
```

### 5.2 評価観点チェックリスト

変更前後で以下を比較:

- [ ] noise rate は下がったか（過分離改善）
- [ ] 最大クラスタサイズは妥当か（過合流していないか）
- [ ] size 2-3 のクラスタが生成されているか
- [ ] 明らかな誤合流が新たに発生していないか（大クラスタを目視）
- [ ] avg_similarity の分布が悪化していないか

---

## 6. 段階的な改善ロードマップ

### Phase 1: 現行パラメータの最適化（コード変更なし）

環境変数の調整のみで改善できる範囲を探る。

1. BERTopic使用時: `BERTOPIC_MIN_CLUSTER_SIZE` を 4 → 2 に下げてノイズ率の変化を見る
2. Refine閾値の調整: `REFINE_INTER_THRESHOLD` を 0.92 → 0.90 に下げてmerge効果を見る
3. Greedy使用時: `GROUP_CLUSTER_THRESHOLD` を 0.01 刻みで調整

### Phase 2: UMAP パラメータの環境変数化

`n_neighbors` と `min_dist` を環境変数で外出しし、コード変更なしで調整可能にする。

### Phase 3: 評価の定量化

手動ラベル付きデータセット（正解クラスタ）を作成し、ARI（Adjusted Rand Index）などの指標で自動評価。
→ `/inspect` で修正したグループをゴールドスタンダードとして保存する仕組み。

---

## 7. 変更記録テンプレート

改善を追跡するため、変更ごとに以下を記録する。

```markdown
### YYYY-MM-DD: {変更内容}

- **変更**: {パラメータ名} {旧値} → {新値}
- **ログ**: batch/logs/group_XXXXXXXX_XXXXXX.json
- **結果**:
  - noise rate: XX% → XX%
  - max cluster size: XX → XX
  - 目視で確認した改善点 / 悪化点:
- **判定**: 採用 / 不採用 / 要追加検証
```
