package db

import (
	"math"
	"testing"
)

// --- CosineSimilarity ---

func TestCosineSimilarity_Same(t *testing.T) {
	v := []float32{1, 2, 3}
	got := CosineSimilarity(v, v)
	if math.Abs(float64(got)-1.0) > 1e-5 {
		t.Errorf("same vector: got %v, want ~1.0", got)
	}
}

func TestCosineSimilarity_Orthogonal(t *testing.T) {
	a := []float32{1, 0, 0}
	b := []float32{0, 1, 0}
	got := CosineSimilarity(a, b)
	if math.Abs(float64(got)) > 1e-5 {
		t.Errorf("orthogonal: got %v, want ~0.0", got)
	}
}

func TestCosineSimilarity_Opposite(t *testing.T) {
	a := []float32{1, 0, 0}
	b := []float32{-1, 0, 0}
	got := CosineSimilarity(a, b)
	if math.Abs(float64(got)+1.0) > 1e-5 {
		t.Errorf("opposite: got %v, want ~-1.0", got)
	}
}

func TestCosineSimilarity_LengthMismatch(t *testing.T) {
	a := []float32{1, 0}
	b := []float32{1, 0, 0}
	got := CosineSimilarity(a, b)
	if got != 0 {
		t.Errorf("length mismatch: got %v, want 0", got)
	}
}

func TestCosineSimilarity_Empty(t *testing.T) {
	got := CosineSimilarity(nil, nil)
	if got != 0 {
		t.Errorf("empty: got %v, want 0", got)
	}
}

// --- MeanVector ---

func TestMeanVector_Two(t *testing.T) {
	a := []float32{1, 0}
	b := []float32{0, 1}
	got := MeanVector([][]float32{a, b})
	if len(got) != 2 || math.Abs(float64(got[0])-0.5) > 1e-5 || math.Abs(float64(got[1])-0.5) > 1e-5 {
		t.Errorf("got %v, want [0.5, 0.5]", got)
	}
}

func TestMeanVector_Empty(t *testing.T) {
	got := MeanVector(nil)
	if got != nil {
		t.Errorf("empty: got %v, want nil", got)
	}
}

func TestMeanVector_Single(t *testing.T) {
	v := []float32{3, 6, 9}
	got := MeanVector([][]float32{v})
	for i, val := range got {
		if math.Abs(float64(val)-float64(v[i])) > 1e-5 {
			t.Errorf("single vector: got[%d]=%v, want %v", i, val, v[i])
		}
	}
}

// --- parseVectorStr ---

func TestParseVectorStr_Normal(t *testing.T) {
	got := parseVectorStr("[1.0,2.0,3.0]")
	want := []float32{1, 2, 3}
	if len(got) != len(want) {
		t.Fatalf("got len %d, want %d", len(got), len(want))
	}
	for i := range want {
		if math.Abs(float64(got[i])-float64(want[i])) > 1e-5 {
			t.Errorf("[%d]: got %v, want %v", i, got[i], want[i])
		}
	}
}

func TestParseVectorStr_Empty(t *testing.T) {
	got := parseVectorStr("[]")
	if got != nil {
		t.Errorf("empty brackets: got %v, want nil", got)
	}
}

func TestParseVectorStr_EmptyString(t *testing.T) {
	got := parseVectorStr("")
	if got != nil {
		t.Errorf("empty string: got %v, want nil", got)
	}
}

func TestParseVectorStr_Spaces(t *testing.T) {
	got := parseVectorStr("[1.0, 2.0, 3.0]")
	if len(got) != 3 {
		t.Fatalf("got len %d, want 3", len(got))
	}
}
