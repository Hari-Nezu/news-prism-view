package steps

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"os/exec"
	"time"

	"github.com/newsprism/batch/internal/config"
	"github.com/newsprism/shared/db"
)

type bertopicInput struct {
	Articles []bertopicArticle `json:"articles"`
	Params   bertopicParams    `json:"params"`
}

type bertopicArticle struct {
	URL       string    `json:"url"`
	Embedding []float32 `json:"embedding"`
}

type bertopicParams struct {
	MinClusterSize int `json:"min_cluster_size"`
	UMAPComponents int `json:"umap_n_components"`
}

type bertopicOutput struct {
	Clusters  []bertopicCluster `json:"clusters"`
	NoiseURLs []string          `json:"noise_urls"`
}

type bertopicCluster struct {
	ArticleURLs []string `json:"article_urls"`
}

// GroupArticlesBERTopic は Python サブプロセスで BERTopic クラスタリングを実行する。
// Python 実行失敗時は GroupArticles にフォールバックする。
func GroupArticlesBERTopic(ctx context.Context, articles []db.Article, cfg config.BERTopicConfig) []Cluster {
	var withEmbed, noEmbed []db.Article
	urlIndex := make(map[string]db.Article, len(articles))
	for _, a := range articles {
		if len(a.Embedding) > 0 {
			withEmbed = append(withEmbed, a)
			urlIndex[a.URL] = a
		} else {
			noEmbed = append(noEmbed, a)
		}
	}

	if len(withEmbed) == 0 {
		// embedding なし記事のみ → 全て単独クラスタ
		clusters := make([]Cluster, 0, len(noEmbed))
		for _, a := range noEmbed {
			clusters = append(clusters, Cluster{Articles: []db.Article{a}, DomCate: a.Category})
		}
		return clusters
	}

	input := buildBERTopicInput(withEmbed, cfg)
	inputJSON, err := json.Marshal(input)
	if err != nil {
		slog.Warn("bertopic: JSON marshal failed, falling back", "err", err)
		return GroupArticles(articles, cfg.FallbackThreshold)
	}

	timeout := time.Duration(cfg.TimeoutSec) * time.Second
	ctx2, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	cmd := exec.CommandContext(ctx2, cfg.PythonPath, cfg.ScriptPath)
	cmd.Stdin = bytes.NewReader(inputJSON)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		slog.Warn("bertopic: subprocess failed, falling back",
			"err", err, "stderr", stderr.String())
		return GroupArticles(articles, cfg.FallbackThreshold)
	}
	if stderr.Len() > 0 {
		slog.Debug("bertopic: subprocess stderr", "output", stderr.String())
	}

	var result bertopicOutput
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		slog.Warn("bertopic: JSON parse failed, falling back", "err", err)
		return GroupArticles(articles, cfg.FallbackThreshold)
	}

	clusters := buildBERTopicClusters(result.Clusters, urlIndex)

	// クラスタ内平均類似度を計算
	for i := range clusters {
		clusters[i].AvgSimilarity = clusterAvgSimilarity(clusters[i])
	}

	// サマリー: 2記事以上のクラスタの中身を出力
	for i, c := range clusters {
		if len(c.Articles) < 2 {
			continue
		}
		titles := make([]string, len(c.Articles))
		for j, a := range c.Articles {
			titles[j] = a.Title
		}
		slog.Debug("group(bertopic): cluster summary",
			"cluster_idx", i,
			"size", len(c.Articles),
			"titles", titles,
		)
	}

	slog.Debug("group(bertopic): noise articles", "count", len(result.NoiseURLs))
	for _, u := range result.NoiseURLs {
		a, ok := urlIndex[u]
		if !ok {
			slog.Warn("group(bertopic): noise URL not found in index", "url", u)
			continue
		}
		clusters = append(clusters, Cluster{
			Centroid: a.Embedding,
			Articles: []db.Article{a},
			DomCate:  a.Category,
		})
	}

	for _, a := range noEmbed {
		clusters = append(clusters, Cluster{
			Articles: []db.Article{a},
			DomCate:  a.Category,
		})
	}

	return clusters
}

func buildBERTopicInput(articles []db.Article, cfg config.BERTopicConfig) bertopicInput {
	items := make([]bertopicArticle, len(articles))
	for i, a := range articles {
		items[i] = bertopicArticle{URL: a.URL, Embedding: a.Embedding}
	}
	return bertopicInput{
		Articles: items,
		Params: bertopicParams{
			MinClusterSize: cfg.MinClusterSize,
			UMAPComponents: cfg.UMAPComponents,
		},
	}
}

func buildBERTopicClusters(raw []bertopicCluster, urlIndex map[string]db.Article) []Cluster {
	clusters := make([]Cluster, 0, len(raw))
	for _, rc := range raw {
		var arts []db.Article
		for _, u := range rc.ArticleURLs {
			a, ok := urlIndex[u]
			if !ok {
				slog.Warn("group(bertopic): cluster URL not found in index", "url", u)
				continue
			}
			arts = append(arts, a)
		}
		if len(arts) == 0 {
			continue
		}
		clusters = append(clusters, Cluster{
			Centroid: meanVector(articleVectors(arts)),
			Articles: arts,
			DomCate:  dominantCate(arts),
		})
	}
	return clusters
}
