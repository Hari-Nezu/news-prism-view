package steps

import (
	"log/slog"
	"math"

	"github.com/newsprism/shared/db"
)

const categoryOther = "other"

// Cluster represents a group of articles with a centroid embedding.
type Cluster struct {
	Centroid      []float32
	Articles      []db.Article
	DomCate       string
	AvgSimilarity float64 // クラスタ内の平均コサイン類似度（centroid対各記事）
}

// GroupArticles performs greedy cosine similarity clustering.
// Articles without embeddings are placed in single-article clusters.
// Category is not used as a gate — grouping is based purely on embedding similarity.
// Category is assigned post-hoc via dominantCate.
func GroupArticles(articles []db.Article, threshold float64) []Cluster {
	var clusters []Cluster

	for _, a := range articles {
		if len(a.Embedding) == 0 {
			clusters = append(clusters, Cluster{
				Articles: []db.Article{a},
				DomCate:  a.Category,
			})
			continue
		}

		bestIdx, bestSim := -1, -1.0
		for i, c := range clusters {
			if len(c.Centroid) == 0 {
				continue
			}
			sim := float64(cosineSimilarity(a.Embedding, c.Centroid))
			if sim > threshold && sim > bestSim {
				bestIdx, bestSim = i, sim
			}
		}

		if bestIdx >= 0 {
			slog.Debug("group: article merged",
				"title", a.Title,
				"cluster_idx", bestIdx,
				"cluster_title", clusters[bestIdx].Articles[0].Title,
				"similarity", bestSim,
				"cluster_size", len(clusters[bestIdx].Articles)+1,
			)
			clusters[bestIdx].Articles = append(clusters[bestIdx].Articles, a)
			clusters[bestIdx].Centroid = meanVector(articleVectors(clusters[bestIdx].Articles))
			clusters[bestIdx].DomCate = dominantCate(clusters[bestIdx].Articles)
		} else {
			slog.Debug("group: new cluster",
				"title", a.Title,
				"cluster_idx", len(clusters),
			)
			clusters = append(clusters, Cluster{
				Centroid: a.Embedding,
				Articles: []db.Article{a},
				DomCate:  a.Category,
			})
		}
	}

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
		slog.Debug("group: cluster summary",
			"cluster_idx", i,
			"size", len(c.Articles),
			"titles", titles,
		)
	}

	return clusters
}

// clusterAvgSimilarity はクラスタ内の各記事とセントロイドの平均コサイン類似度を返す。
func clusterAvgSimilarity(c Cluster) float64 {
	if len(c.Centroid) == 0 || len(c.Articles) <= 1 {
		return 0
	}
	var sum float64
	var n int
	for _, a := range c.Articles {
		if len(a.Embedding) == 0 {
			continue
		}
		sum += float64(cosineSimilarity(a.Embedding, c.Centroid))
		n++
	}
	if n == 0 {
		return 0
	}
	return sum / float64(n)
}

func cosineSimilarity(a, b []float32) float32 {
	if len(a) != len(b) {
		return 0
	}
	var dot, normA, normB float64
	for i := range a {
		dot += float64(a[i]) * float64(b[i])
		normA += float64(a[i]) * float64(a[i])
		normB += float64(b[i]) * float64(b[i])
	}
	if normA == 0 || normB == 0 {
		return 0
	}
	return float32(dot / (math.Sqrt(normA) * math.Sqrt(normB)))
}

func meanVector(vectors [][]float32) []float32 {
	if len(vectors) == 0 {
		return nil
	}
	dim := len(vectors[0])
	result := make([]float32, dim)
	for _, v := range vectors {
		for i := range v {
			result[i] += v[i]
		}
	}
	n := float32(len(vectors))
	for i := range result {
		result[i] /= n
	}
	return result
}

func articleVectors(articles []db.Article) [][]float32 {
	vectors := make([][]float32, 0, len(articles))
	for _, a := range articles {
		if len(a.Embedding) > 0 {
			vectors = append(vectors, a.Embedding)
		}
	}
	return vectors
}

func dominantCate(articles []db.Article) string {
	counts := make(map[string]int)
	for _, a := range articles {
		cat := a.Category
		if cat == "" {
			cat = categoryOther
		}
		counts[cat]++
	}
	best, bestN := categoryOther, 0
	for cat, n := range counts {
		if n > bestN {
			best, bestN = cat, n
		}
	}
	return best
}
