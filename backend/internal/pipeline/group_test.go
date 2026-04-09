package pipeline

import (
	"testing"

	"github.com/newsprism/batch/internal/db"
)

func vector(v ...float32) []float32 { return v }

// nearVector returns a vector close to base but slightly different.
func nearVector(base []float32) []float32 {
	out := make([]float32, len(base))
	copy(out, base)
	out[0] += 0.001
	return out
}

func makeArticle(category string, embedding []float32) db.Article {
	return db.Article{Category: category, Embedding: embedding}
}

// Case 1: 同一カテゴリ → 1 cluster に merge される
func TestGroupArticles_SameCategory(t *testing.T) {
	v := vector(1, 0, 0)
	articles := []db.Article{
		makeArticle("politics", v),
		makeArticle("politics", nearVector(v)),
	}
	clusters := GroupArticles(articles, 0.87)
	if len(clusters) != 1 {
		t.Errorf("want 1 cluster, got %d", len(clusters))
	}
}

// Case 2: 異カテゴリ → 2 clusters に分かれる
func TestGroupArticles_DifferentCategory(t *testing.T) {
	v := vector(1, 0, 0)
	articles := []db.Article{
		makeArticle("politics", v),
		makeArticle("economy", nearVector(v)),
	}
	clusters := GroupArticles(articles, 0.87)
	if len(clusters) != 2 {
		t.Errorf("want 2 clusters, got %d", len(clusters))
	}
}

// Case 3: other と既知カテゴリ → 2 clusters
func TestGroupArticles_OtherVsKnown(t *testing.T) {
	v := vector(1, 0, 0)
	articles := []db.Article{
		makeArticle("other", v),
		makeArticle("politics", nearVector(v)),
	}
	clusters := GroupArticles(articles, 0.87)
	if len(clusters) != 2 {
		t.Errorf("want 2 clusters, got %d", len(clusters))
	}
}

// Case 4: unknown 同士 → 高閾値を超えれば 1 cluster
func TestGroupArticles_UnknownMerge(t *testing.T) {
	// 完全に同じベクトルなら similarity=1.0 → unknown 閾値 (0.87+0.05=0.92) を超える
	v := vector(1, 0, 0)
	articles := []db.Article{
		makeArticle("other", v),
		makeArticle("other", v),
	}
	clusters := GroupArticles(articles, 0.87)
	if len(clusters) != 1 {
		t.Errorf("want 1 cluster, got %d", len(clusters))
	}
}

// Case 5: embedding なし → 単独 cluster
func TestGroupArticles_NoEmbedding(t *testing.T) {
	v := vector(1, 0, 0)
	articles := []db.Article{
		makeArticle("politics", nil),
		makeArticle("politics", v),
	}
	clusters := GroupArticles(articles, 0.87)
	if len(clusters) != 2 {
		t.Errorf("want 2 clusters (no-embed article is solo), got %d", len(clusters))
	}
}

// Case 6: 空カテゴリは unknown 扱い → 既知カテゴリと merge されない
func TestGroupArticles_EmptyCategoryVsKnown(t *testing.T) {
	v := vector(1, 0, 0)
	articles := []db.Article{
		makeArticle("", v),
		makeArticle("politics", nearVector(v)),
	}
	clusters := GroupArticles(articles, 0.87)
	if len(clusters) != 2 {
		t.Errorf("want 2 clusters, got %d", len(clusters))
	}
}

// Case 7: 空カテゴリ同士は高閾値を超えれば merge される
func TestGroupArticles_EmptyCategoryMerge(t *testing.T) {
	v := vector(1, 0, 0)
	articles := []db.Article{
		makeArticle("", v),
		makeArticle("", v),
	}
	clusters := GroupArticles(articles, 0.87)
	if len(clusters) != 1 {
		t.Errorf("want 1 cluster, got %d", len(clusters))
	}
}
