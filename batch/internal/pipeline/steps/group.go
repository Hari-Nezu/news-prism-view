package steps

import (
	"math"

	"github.com/newsprism/shared/db"
)

const (
	categoryOther                  = "other"
	unknownCategoryThresholdOffset = 0.05
)

// Cluster represents a group of articles with a centroid embedding.
type Cluster struct {
	Centroid []float32
	Articles []db.Article
	DomCate  string
}

func isUnknownCategory(cat string) bool {
	return cat == "" || cat == categoryOther
}

// canJoinCluster reports whether an article with articleCate may join a cluster with clusterCate.
// Known categories require exact match; unknown categories ("" or "other") may only join each other.
func canJoinCluster(articleCate, clusterCate string) bool {
	if isUnknownCategory(articleCate) || isUnknownCategory(clusterCate) {
		return isUnknownCategory(articleCate) && isUnknownCategory(clusterCate)
	}
	return articleCate == clusterCate
}

// GroupArticles performs greedy cosine similarity clustering.
// Articles without embeddings are placed in single-article clusters.
// Articles may only join clusters with the same category (hard gate).
// Unknown categories ("" or "other") require a higher similarity threshold.
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

		localThreshold := threshold
		if isUnknownCategory(a.Category) {
			localThreshold = threshold + unknownCategoryThresholdOffset
		}

		bestIdx, bestSim := -1, localThreshold
		for i, c := range clusters {
			if len(c.Centroid) == 0 {
				continue
			}
			if !canJoinCluster(a.Category, c.DomCate) {
				continue
			}
			sim := float64(cosineSimilarity(a.Embedding, c.Centroid))
			if sim > bestSim {
				bestIdx, bestSim = i, sim
			}
		}

		if bestIdx >= 0 {
			clusters[bestIdx].Articles = append(clusters[bestIdx].Articles, a)
			clusters[bestIdx].Centroid = meanVector(articleVectors(clusters[bestIdx].Articles))
			clusters[bestIdx].DomCate = dominantCate(clusters[bestIdx].Articles)
		} else {
			clusters = append(clusters, Cluster{
				Centroid: a.Embedding,
				Articles: []db.Article{a},
				DomCate:  a.Category,
			})
		}
	}
	return clusters
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
		if isUnknownCategory(cat) {
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
