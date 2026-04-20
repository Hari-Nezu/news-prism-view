#!/usr/bin/env python3
"""BERTopic clustering subprocess for NewsPrism batch pipeline.

stdin:  JSON {"articles": [{"url": str, "embedding": [float]}], "params": {...}}
stdout: JSON {"clusters": [{"article_urls": [str]}], "noise_urls": [str]}
stderr: ログ出力（Go 側でキャプチャ）
"""

import json
import sys

import numpy as np
from hdbscan import HDBSCAN
from umap import UMAP


def main():
    data = json.load(sys.stdin)
    articles = data["articles"]
    params = data.get("params", {})

    urls = [a["url"] for a in articles]
    embeddings = np.array([a["embedding"] for a in articles], dtype=np.float32)

    min_cluster_size = params.get("min_cluster_size", 3)
    n_components = params.get("umap_n_components", 5)

    print(f"bertopic: {len(urls)} articles, min_cluster_size={min_cluster_size}, umap_n_components={n_components}", file=sys.stderr)

    # 記事数が少なすぎる場合は UMAP をスキップ
    if len(urls) < n_components + 2:
        print(f"bertopic: skipping UMAP (too few articles: {len(urls)})", file=sys.stderr)
        reduced = embeddings
    else:
        umap_model = UMAP(
            n_neighbors=15,
            min_dist=0.0,
            n_components=n_components,
            metric="cosine",
            random_state=42,
        )
        reduced = umap_model.fit_transform(embeddings)
        print(f"bertopic: UMAP done -> shape {reduced.shape}", file=sys.stderr)

    hdbscan_model = HDBSCAN(
        min_cluster_size=min_cluster_size,
        metric="euclidean",  # UMAP 後はユークリッド距離が適切
    )
    labels = hdbscan_model.fit_predict(reduced)

    n_clusters = len(set(labels) - {-1})
    n_noise = int((labels == -1).sum())
    print(f"bertopic: HDBSCAN done -> {n_clusters} clusters, {n_noise} noise", file=sys.stderr)

    clusters: dict[int, list[str]] = {}
    noise_urls: list[str] = []
    for i, label in enumerate(labels):
        if label == -1:
            noise_urls.append(urls[i])
        else:
            clusters.setdefault(int(label), []).append(urls[i])

    output = {
        "clusters": [{"article_urls": article_urls} for article_urls in clusters.values()],
        "noise_urls": noise_urls,
    }
    json.dump(output, sys.stdout)


if __name__ == "__main__":
    main()
