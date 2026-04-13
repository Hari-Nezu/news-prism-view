package steps

import (
	"math"

	"github.com/newsprism/shared/db"
)

const (
	categoryOther                  = "other"
	unknownCategoryThresholdOffset = 0.05
	crossCategoryThresholdOffset   = 0.08
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

// GroupArticles performs greedy cosine similarity clustering.
// Articles without embeddings are placed in single-article clusters.
// Unknown vs known category pairs are hard-blocked.
// Known category mismatches require a higher similarity threshold (soft gate).
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

			articleUnknown := isUnknownCategory(a.Category)
			clusterUnknown := isUnknownCategory(c.DomCate)
			effectiveThreshold := threshold
			if articleUnknown || clusterUnknown {
				if !(articleUnknown && clusterUnknown) {
					continue // unknown vs known: hard block
				}
				effectiveThreshold += unknownCategoryThresholdOffset
			} else if a.Category != c.DomCate {
				effectiveThreshold += crossCategoryThresholdOffset
			}

			sim := float64(cosineSimilarity(a.Embedding, c.Centroid))
			if sim > effectiveThreshold && sim > bestSim {
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
