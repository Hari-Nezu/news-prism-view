# NewsGroup.topic 廃止および統一化 設計

## 概要
3層分類リファクタ完了に伴い、`NewsGroup.topic` が型上だけ残存し `groupTitle` と二重表現になっている問題の解消設計。

## 今後の整理案

- `NewsGroup.topic` を完全に `groupTitle` へ寄せて廃止する。
- 参照箇所を洗い出して整合を取り、新規コード・UIが `topic` に依存しないようにする。
- 型定義と実データの意味を一致させる。
