package pipeline

import (
	"math"

	"github.com/newsprism/batch/internal/db"
)

// Cluster represents a group of articles with a centroid embedding.
type Cluster struct {
	Centroid []float32
	Articles []db.Article
	DomCat   string
}

// GroupArticles performs greedy cosine similarity clustering.
// Articles without embeddings are placed in single-article clusters.
func GroupArticles(articles []db.Article, threshold float64) []Cluster {
	var clusters []Cluster

	for _, a := range articles {
		if len(a.Embedding) == 0 {
			clusters = append(clusters, Cluster{
				Articles: []db.Article{a},
				DomCat:   a.Category,
			})
			continue
		}

		bestIdx, bestSim := -1, threshold
		for i, c := range clusters {
			if len(c.Centroid) == 0 {
				continue
			}
			sim := float64(cosineSim(a.Embedding, c.Centroid))
			// Soft penalty for cross-category matches
			if a.Category != "" && a.Category != "other" &&
				c.DomCat != "other" && a.Category != c.DomCat {
				sim *= 0.7
			}
			if sim > bestSim {
				bestIdx, bestSim = i, sim
			}
		}

		if bestIdx >= 0 {
			clusters[bestIdx].Articles = append(clusters[bestIdx].Articles, a)
			clusters[bestIdx].Centroid = meanVec(articleVecs(clusters[bestIdx].Articles))
			clusters[bestIdx].DomCat = dominantCat(clusters[bestIdx].Articles)
		} else {
			clusters = append(clusters, Cluster{
				Centroid: a.Embedding,
				Articles: []db.Article{a},
				DomCat:   a.Category,
			})
		}
	}
	return clusters
}

func cosineSim(a, b []float32) float32 {
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

func meanVec(vecs [][]float32) []float32 {
	if len(vecs) == 0 {
		return nil
	}
	dim := len(vecs[0])
	result := make([]float32, dim)
	for _, v := range vecs {
		for i := range v {
			result[i] += v[i]
		}
	}
	n := float32(len(vecs))
	for i := range result {
		result[i] /= n
	}
	return result
}

func articleVecs(articles []db.Article) [][]float32 {
	vecs := make([][]float32, 0, len(articles))
	for _, a := range articles {
		if len(a.Embedding) > 0 {
			vecs = append(vecs, a.Embedding)
		}
	}
	return vecs
}

func dominantCat(articles []db.Article) string {
	counts := make(map[string]int)
	for _, a := range articles {
		counts[a.Category]++
	}
	best, bestN := "other", 0
	for cat, n := range counts {
		if n > bestN {
			best, bestN = cat, n
		}
	}
	return best
}
