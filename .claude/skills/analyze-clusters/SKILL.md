---
name: analyze-clusters
description: グルーピングログ(batch/logs/group_*.json)を分析し、クラスタリング品質を評価する。問題パターン(過合流・過分離・ノイズ過多)を特定し改善提案を行う。
model: haiku
disable-model-invocation: true
allowed-tools: Bash Read Glob Grep
---

# クラスタリング分析スキル

グルーピングログを分析してクラスタリング品質を評価する。

## 引数

- 引数なし: 最新のログを分析
- ファイルパス指定: 指定ログを分析
- 2つのファイルパス: 2つのログをA/B比較

## 実行手順

### Step 1: ログ特定

引数がなければ `batch/logs/group_*.json` の最新ファイルを使う。

### Step 2: 基本統計の算出

以下のBashコマンドで統計サマリーを出す:

```bash
python3 -c "
import json, sys
with open('TARGET_FILE') as f:
    d = json.load(f)
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
sizes = {}
for e in d:
    sizes[e['size']] = sizes.get(e['size'], 0) + 1
print('size distribution:', dict(sorted(sizes.items())))
# 大きすぎるクラスタ
big = [e for e in d if e['size'] >= 15]
if big:
    print(f'\n--- 大クラスタ (size>=15) ---')
    for e in big:
        print(f'Group {e[\"index\"]}: size={e[\"size\"]}, sim={e[\"avg_similarity\"]:.4f}')
        for a in e['articles'][:5]:
            print(f'  - {a[\"title\"][:50]}')
        if e['size'] > 5:
            print(f'  ... (残り{e[\"size\"]-5}件)')
"
```

### Step 3: 健全性指標の評価

以下の基準でログを評価する:

| 指標 | 目安 | 判定 |
|:--|:--|:--|
| noise rate | < 25% | 超えると過分離の疑い |
| 最大クラスタサイズ | < 30 | 超えると過合流の疑い |
| size 2-3 のクラスタ数 | 0でない | 0なら min_cluster_size が高すぎ |
| avg_similarity p10 | > 0.90 | 下回ると内部不一致の疑い |

### Step 4: 問題パターンの特定

以下の3パターンを自動チェックする:

#### A. 過合流チェック
size >= 10 のクラスタについて、全記事タイトルを出力し、内容の一貫性を目視で評価。異なるトピックの混在がないか確認する。特に:
- 「キーワードが同じだが別の事件」(例: "警察官"で異なる事件がまとまる)
- 「カテゴリレベルで雑にまとまっている」(例: スポーツ全般が1グループ)

#### B. 過分離チェック
同一トピックの記事が別グループに分かれていないか。タイトルの類似パターンをgrepで探す:
```bash
python3 -c "
import json
with open('TARGET_FILE') as f:
    d = json.load(f)
# タイトルの先頭20文字が類似する記事を異なるグループから探す
from collections import defaultdict
prefix_map = defaultdict(list)
for g in d:
    for a in g['articles']:
        prefix = a['title'][:20]
        prefix_map[prefix].append(g['index'])
for prefix, groups in prefix_map.items():
    unique = set(groups)
    if len(unique) > 1:
        print(f'分離疑い: \"{prefix}...\" → Group {sorted(unique)}')
"
```

#### C. consensus不整合チェック
consensusに記載された内容が、そのグループの記事と合致しているか確認する:
```bash
python3 -c "
import json
with open('TARGET_FILE') as f:
    d = json.load(f)
for g in d:
    if g['size'] >= 2 and 'consensus' in g and g['consensus']:
        titles_text = ' '.join(a['title'] for a in g['articles'])
        for c in g['consensus'][:3]:
            # consensus内のキーワードが記事タイトルに1つも含まれないケースを検出
            fact_words = [w for w in c['fact'].split() if len(w) >= 3]
            match_count = sum(1 for w in fact_words if w in titles_text)
            if match_count == 0 and len(fact_words) >= 3:
                print(f'Group {g[\"index\"]}: consensus \"{c[\"fact\"][:60]}\" がタイトルと不一致')
"
```

### Step 5: レポート出力

以下の形式で日本語レポートを出力する:

```
## クラスタリング分析レポート
対象: {ファイル名}

### 基本統計
(Step 2の結果をテーブルで)

### 健全性判定
(Step 3の各指標にOK/NG判定)

### 検出された問題
(Step 4の結果を問題パターン別に列挙)

### 改善提案
(検出された問題パターンに基づき、docs/guide/clustering-tuning-playbook.md のパラメータ調整を提案)
```

### Step 6: A/B比較 (2つのログ指定時のみ)

2つのログが指定された場合、以下を追加で出力:

```bash
python3 -c "
import json, sys
with open('BEFORE_FILE') as f:
    before = json.load(f)
with open('AFTER_FILE') as f:
    after = json.load(f)
def stats(d):
    total = sum(e['size'] for e in d)
    multi = [e for e in d if e['size'] >= 2]
    noise = [e for e in d if e['size'] == 1]
    sims = [e['avg_similarity'] for e in multi] if multi else [0]
    return {
        'articles': total, 'clusters': len(d),
        'multi': len(multi), 'noise': len(noise),
        'noise_rate': len(noise)/len(d)*100,
        'sim_mean': sum(sims)/len(sims),
        'max_size': max(e['size'] for e in d),
    }
b, a = stats(before), stats(after)
print(f'| 指標 | Before | After | 変化 |')
print(f'|---|---|---|---|')
for k in ['clusters','multi','noise','noise_rate','sim_mean','max_size']:
    fmt = '.1f' if k in ('noise_rate','sim_mean') else 'd'
    print(f'| {k} | {b[k]:{fmt}} | {a[k]:{fmt}} | {a[k]-b[k]:+{fmt}} |')
"
```
