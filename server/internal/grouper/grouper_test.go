package grouper

import (
	"testing"

	"github.com/newsprism/shared/db"
)

// --- groupGreedy ---

func TestGroupGreedy_NoEmbedding(t *testing.T) {
	articles := []db.Article{
		{URL: "a", Title: "記事A"},
		{URL: "b", Title: "記事B"},
	}
	clusters := groupGreedy(articles, 0.8)
	if len(clusters) != 2 {
		t.Fatalf("embedding なし: got %d clusters, want 2", len(clusters))
	}
}

func TestGroupGreedy_SameVector(t *testing.T) {
	vec := []float32{1, 0, 0}
	articles := []db.Article{
		{URL: "a", Title: "記事A", Embedding: vec},
		{URL: "b", Title: "記事B", Embedding: vec},
	}
	clusters := groupGreedy(articles, 0.8)
	if len(clusters) != 1 {
		t.Fatalf("同一ベクトル: got %d clusters, want 1", len(clusters))
	}
	if len(clusters[0].Articles) != 2 {
		t.Fatalf("got %d articles in cluster, want 2", len(clusters[0].Articles))
	}
}

func TestGroupGreedy_OrthogonalVectors(t *testing.T) {
	articles := []db.Article{
		{URL: "a", Title: "記事A", Embedding: []float32{1, 0, 0}},
		{URL: "b", Title: "記事B", Embedding: []float32{0, 1, 0}},
	}
	clusters := groupGreedy(articles, 0.8)
	if len(clusters) != 2 {
		t.Fatalf("直交ベクトル: got %d clusters, want 2", len(clusters))
	}
}

func TestGroupGreedy_CategorySoftGate_HighSim(t *testing.T) {
	// sim=1.0 > threshold(0.5)+offset(0.08)=0.58 → soft gate を超えてマージ
	vec := []float32{1, 0, 0}
	articles := []db.Article{
		{URL: "a", Title: "記事A", Embedding: vec, Category: "politics"},
		{URL: "b", Title: "記事B", Embedding: vec, Category: "sports"},
	}
	clusters := groupGreedy(articles, 0.5)
	if len(clusters) != 1 {
		t.Fatalf("high-sim cross-category: got %d clusters, want 1", len(clusters))
	}
}

func TestGroupGreedy_CategorySoftGate_ModerateSim(t *testing.T) {
	// [1,0,0] vs [0.54,0.842,0]: sim≈0.54, threshold=0.5, effective=0.58 → ブロック
	articles := []db.Article{
		{URL: "a", Title: "記事A", Embedding: []float32{1, 0, 0}, Category: "politics"},
		{URL: "b", Title: "記事B", Embedding: []float32{0.54, 0.842, 0}, Category: "sports"},
	}
	clusters := groupGreedy(articles, 0.5)
	if len(clusters) != 2 {
		t.Fatalf("moderate-sim cross-category: got %d clusters, want 2", len(clusters))
	}
}

func TestGroupGreedy_CentroidUpdate(t *testing.T) {
	// 3記事を同クラスタに追加してセントロイドが平均に収束することを確認
	v1 := []float32{1, 0, 0}
	v2 := []float32{1, 0, 0}
	v3 := []float32{1, 0, 0}
	articles := []db.Article{
		{URL: "a", Embedding: v1},
		{URL: "b", Embedding: v2},
		{URL: "c", Embedding: v3},
	}
	clusters := groupGreedy(articles, 0.5)
	if len(clusters) != 1 {
		t.Fatalf("got %d clusters, want 1", len(clusters))
	}
	// セントロイドは (1,0,0) のまま
	c := clusters[0].Centroid
	if len(c) == 0 || c[0] != 1 {
		t.Errorf("centroid[0] = %v, want 1", c)
	}
}

// --- isSingleOutlet ---

func TestIsSingleOutlet(t *testing.T) {
	t.Run("1件", func(t *testing.T) {
		arts := []db.Article{{Source: "NHK"}}
		if !isSingleOutlet(arts) {
			t.Error("1件は single outlet")
		}
	})
	t.Run("同一Source", func(t *testing.T) {
		arts := []db.Article{{Source: "NHK"}, {Source: "NHK"}}
		if !isSingleOutlet(arts) {
			t.Error("同一 source は single outlet")
		}
	})
	t.Run("異なるSource", func(t *testing.T) {
		arts := []db.Article{{Source: "NHK"}, {Source: "朝日"}}
		if isSingleOutlet(arts) {
			t.Error("異なる source は not single outlet")
		}
	})
	t.Run("空スライス", func(t *testing.T) {
		if !isSingleOutlet([]db.Article{}) {
			t.Error("空は single outlet 扱い")
		}
	})
}

// --- dominantCategory ---

func TestDominantCategory(t *testing.T) {
	arts := []db.Article{
		{Category: "politics"},
		{Category: "sports"},
		{Category: "politics"},
	}
	if got := dominantCategory(arts); got != "politics" {
		t.Errorf("got %q, want %q", got, "politics")
	}
}

func TestDominantCategory_Empty(t *testing.T) {
	got := dominantCategory([]db.Article{})
	if got != "other" {
		t.Errorf("空スライス: got %q, want %q", got, "other")
	}
}

// --- dominantSubcategory ---

func TestDominantSubcategory(t *testing.T) {
	arts := []db.Article{
		{Subcategory: "tax"},
		{Subcategory: ""},
		{Subcategory: "tax"},
		{Subcategory: "budget"},
	}
	if got := dominantSubcategory(arts); got != "tax" {
		t.Errorf("got %q, want %q", got, "tax")
	}
}

func TestDominantSubcategory_AllEmpty(t *testing.T) {
	arts := []db.Article{{Subcategory: ""}, {Subcategory: ""}}
	if got := dominantSubcategory(arts); got != "" {
		t.Errorf("全空: got %q, want %q", got, "")
	}
}

// --- fallbackTitle ---

func TestFallbackTitle_Short(t *testing.T) {
	c := Cluster{Articles: []db.Article{{Title: "短いタイトル"}}}
	if got := fallbackTitle(c); got != "短いタイトル" {
		t.Errorf("got %q", got)
	}
}

func TestFallbackTitle_Long(t *testing.T) {
	title := "あいうえおかきくけこさしすせそたちつてとなにぬねの" // 25文字
	c := Cluster{Articles: []db.Article{{Title: title}}}
	got := fallbackTitle(c)
	if len([]rune(got)) != 20 {
		t.Errorf("got %d runes, want 20", len([]rune(got)))
	}
}

func TestFallbackTitle_NoArticles(t *testing.T) {
	c := Cluster{}
	if got := fallbackTitle(c); got != "無題" {
		t.Errorf("got %q, want %q", got, "無題")
	}
}
