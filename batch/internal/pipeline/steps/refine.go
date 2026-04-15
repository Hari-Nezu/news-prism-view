package steps

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/newsprism/shared/db"
	"github.com/newsprism/shared/llm"
)

const (
	critiqueChunkSize = 10
	maxCritiqueRounds = 2
)

// CritiqueResult holds the LLM's assessment of a single cluster.
type CritiqueResult struct {
	ClusterIdx     int    `json:"cluster_idx"`
	Verdict        string `json:"verdict"` // "coherent" | "split" | "merge" | "move"
	Reason         string `json:"reason"`
	TargetIdx      *int   `json:"target_idx,omitempty"`
	OutlierIndices []int  `json:"outlier_indices,omitempty"` // クラスタ内の記事インデックス(0始まり)
}

type critiqueResponse struct {
	Critiques []CritiqueResult `json:"critiques"`
}

// RefineClusters runs up to maxCritiqueRounds of Critique→Revise to improve cluster quality.
// intraThresh: クラスタ内min類似度がこれ以上なら coherent とみなしてLLMスキップ。
// interThresh: クラスタ間centroid類似度がこれ以上ならmerge候補としてLLM対象。
func RefineClusters(ctx context.Context, chatClient *llm.ChatClient, clusters []Cluster, intraThresh, interThresh float64) []Cluster {
	for round := 0; round < maxCritiqueRounds; round++ {
		suspectIdxs := triageClusters(clusters, intraThresh, interThresh)
		slog.Info("refine: triage done", "round", round+1, "total", len(clusters), "suspect", len(suspectIdxs))
		if len(suspectIdxs) == 0 {
			break
		}
		critiques := critiqueAll(ctx, chatClient, clusters, suspectIdxs)
		actions := filterActionable(critiques)
		slog.Info("refine: round done", "round", round+1, "actions", len(actions), "total_critiques", len(critiques))
		if len(actions) == 0 {
			break
		}
		clusters = revise(clusters, actions)
	}
	return clusters
}

// triageClusters returns indices of clusters that need LLM review.
// Skips: single-article clusters, clusters where all articles are close to centroid AND no nearby cluster.
func triageClusters(clusters []Cluster, intraThresh, interThresh float64) []int {
	n := len(clusters)
	suspect := make([]bool, n)
	intraSuspect := make([]bool, n)
	interSuspect := make([]bool, n)

	// intra-cluster coherence check
	var intraMinSims []float64
	for i, c := range clusters {
		if len(c.Articles) <= 1 {
			continue // 1記事は定義上coherent
		}
		if len(c.Centroid) == 0 {
			suspect[i] = true
			intraSuspect[i] = true
			continue
		}
		minSim := 1.0
		for _, a := range c.Articles {
			if len(a.Embedding) == 0 {
				continue
			}
			sim := float64(cosineSimilarity(a.Embedding, c.Centroid))
			if sim < minSim {
				minSim = sim
			}
		}
		intraMinSims = append(intraMinSims, minSim)
		if minSim < intraThresh {
			suspect[i] = true
			intraSuspect[i] = true
		}
	}

	// inter-cluster proximity check (merge candidates)
	var interMaxSims []float64
	for i := 0; i < n; i++ {
		if len(clusters[i].Centroid) == 0 {
			continue
		}
		for j := i + 1; j < n; j++ {
			if len(clusters[j].Centroid) == 0 {
				continue
			}
			sim := float64(cosineSimilarity(clusters[i].Centroid, clusters[j].Centroid))
			interMaxSims = append(interMaxSims, sim)
			if sim > interThresh {
				suspect[i] = true
				interSuspect[i] = true
				suspect[j] = true
				interSuspect[j] = true
			}
		}
	}

	idxs := make([]int, 0, n)
	intraCount, interCount, bothCount := 0, 0, 0
	for i, s := range suspect {
		if s {
			idxs = append(idxs, i)
			switch {
			case intraSuspect[i] && interSuspect[i]:
				bothCount++
			case intraSuspect[i]:
				intraCount++
			case interSuspect[i]:
				interCount++
			}
		}
	}

	slog.Debug("refine: triage detail",
		"intra_only", intraCount,
		"inter_only", interCount,
		"both", bothCount,
		"intra_sim_p50", percentile(intraMinSims, 50),
		"intra_sim_p10", percentile(intraMinSims, 10),
		"inter_sim_p90", percentile(interMaxSims, 90),
		"inter_sim_p99", percentile(interMaxSims, 99),
	)

	return idxs
}

// percentile returns the p-th percentile (0-100) of a float64 slice (sorted copy).
func percentile(vals []float64, p int) float64 {
	if len(vals) == 0 {
		return 0
	}
	sorted := make([]float64, len(vals))
	copy(sorted, vals)
	// insertion sort (small N is fine)
	for i := 1; i < len(sorted); i++ {
		for j := i; j > 0 && sorted[j] < sorted[j-1]; j-- {
			sorted[j], sorted[j-1] = sorted[j-1], sorted[j]
		}
	}
	idx := (p * (len(sorted) - 1)) / 100
	return sorted[idx]
}

func critiqueAll(ctx context.Context, chatClient *llm.ChatClient, clusters []Cluster, suspectIdxs []int) []CritiqueResult {
	var all []CritiqueResult
	for start := 0; start < len(suspectIdxs); start += critiqueChunkSize {
		end := start + critiqueChunkSize
		if end > len(suspectIdxs) {
			end = len(suspectIdxs)
		}
		results := critiqueChunk(ctx, chatClient, clusters, suspectIdxs[start:end])
		all = append(all, results...)
	}
	return all
}

func critiqueChunk(ctx context.Context, chatClient *llm.ChatClient, clusters []Cluster, targetIdxs []int) []CritiqueResult {
	var sb strings.Builder

	sb.WriteString("## 批評対象クラスタ\n\n")
	for _, i := range targetIdxs {
		c := clusters[i]
		parts := make([]string, 0, len(c.Articles))
		for j, a := range c.Articles {
			parts = append(parts, fmt.Sprintf("[%d]「%s」", j, a.Title))
		}
		fmt.Fprintf(&sb, "クラスタ%d（%s, %d記事）: %s\n\n",
			i, c.DomCate, len(c.Articles),
			strings.Join(parts, " "),
		)
	}

	// Adjacent clusters for merge context (surrounding the target range)
	minIdx := targetIdxs[0]
	maxIdx := targetIdxs[len(targetIdxs)-1]
	ctxStart := minIdx - critiqueChunkSize
	if ctxStart < 0 {
		ctxStart = 0
	}
	ctxEnd := maxIdx + critiqueChunkSize + 1
	if ctxEnd > len(clusters) {
		ctxEnd = len(clusters)
	}

	// targetIdxs set for exclusion
	targetSet := make(map[int]bool, len(targetIdxs))
	for _, i := range targetIdxs {
		targetSet[i] = true
	}

	// Collect non-target adjacent clusters
	var ctxClusters []int
	for i := ctxStart; i < ctxEnd; i++ {
		if !targetSet[i] {
			ctxClusters = append(ctxClusters, i)
		}
	}
	if len(ctxClusters) > 0 {
		sb.WriteString("## 隣接クラスタ（merge先候補の参考情報）\n\n")
		for _, i := range ctxClusters {
			c := clusters[i]
			titles := make([]string, 0, len(c.Articles))
			for _, a := range c.Articles {
				titles = append(titles, "「"+a.Title+"」")
			}
			fmt.Fprintf(&sb, "クラスタ%d（%s）: %s\n", i, c.DomCate, strings.Join(titles, " "))
		}
	}

	const system = `あなたはニュースクラスタの品質審査員です。各クラスタについて以下を判定してください。

判定種別:
- coherent: クラスタ内の記事がすべて同一のニューストピックを報じている
- split: クラスタ内に明らかに異なるトピックの記事が混在している（outlier_indicesに該当記事の番号[N]を列挙）
- merge: このクラスタは隣接クラスタと実質的に同じトピックを扱っている（target_idxに統合先クラスタ番号を指定）
- move: 特定の記事が別クラスタに属すべきである（outlier_indicesに記事番号[N]、target_idxに移動先クラスタ番号を指定）

注意:
- 1記事のみのクラスタは coherent と判定する
- merge/moveのtarget_idxは「隣接クラスタ」に存在するクラスタ番号のみ指定する
- 批評対象クラスタをすべて評価し、評価漏れを作らない

必ずJSON形式のみで回答してください。
出力フォーマット: { "critiques": [{ "cluster_idx": 0, "verdict": "coherent", "reason": "理由" }, ...] }
split/moveの例: { "cluster_idx": 2, "verdict": "split", "reason": "...", "outlier_indices": [1, 3] }`

	prompt := sb.String()
	t0 := time.Now()
	slog.Debug("refine chunk start", "targets", len(targetIdxs), "prompt_bytes", len(prompt))

	content, err := chatClient.Complete(ctx, system, prompt, 8192)
	if err != nil {
		slog.Warn("refine: LLM error, skipping chunk", "err", err, "targets", targetIdxs, "elapsed_ms", time.Since(t0).Milliseconds())
		return nil
	}
	slog.Debug("refine chunk done", "targets", len(targetIdxs), "elapsed_ms", time.Since(t0).Milliseconds())

	extracted := extractJSON(content)
	var resp critiqueResponse
	if err := json.Unmarshal([]byte(extracted), &resp); err != nil {
		slog.Warn("refine: JSON parse error, skipping chunk", "err", err, "targets", targetIdxs)
		return nil
	}
	return resp.Critiques
}

func filterActionable(critiques []CritiqueResult) []CritiqueResult {
	var actions []CritiqueResult
	for _, c := range critiques {
		if c.Verdict != "coherent" {
			actions = append(actions, c)
		}
	}
	return actions
}

func revise(clusters []Cluster, actions []CritiqueResult) []Cluster {
	n := len(clusters)
	active := make([]bool, n)
	for i := range active {
		active[i] = true
	}

	for _, action := range actions {
		idx := action.ClusterIdx
		if idx < 0 || idx >= n || !active[idx] {
			slog.Warn("refine: invalid cluster idx, skipping", "idx", idx, "verdict", action.Verdict)
			continue
		}

		switch action.Verdict {
		case "merge":
			if action.TargetIdx == nil {
				continue
			}
			tgt := *action.TargetIdx
			if tgt < 0 || tgt >= n || !active[tgt] || tgt == idx {
				slog.Warn("refine: invalid merge target, skipping", "from", idx, "to", tgt)
				continue
			}
			clusters[tgt].Articles = append(clusters[tgt].Articles, clusters[idx].Articles...)
			clusters[tgt].Centroid = meanVector(articleVectors(clusters[tgt].Articles))
			clusters[tgt].DomCate = dominantCate(clusters[tgt].Articles)
			clusters[idx].Articles = nil
			active[idx] = false
			slog.Debug("refine: merge", "from", idx, "to", tgt)

		case "move":
			if action.TargetIdx == nil || len(action.OutlierIndices) == 0 {
				continue
			}
			tgt := *action.TargetIdx
			if tgt < 0 || tgt >= n || !active[tgt] {
				slog.Warn("refine: invalid move target, skipping", "from", idx, "to", tgt)
				continue
			}
			keep, moved := partitionByIndex(clusters[idx].Articles, action.OutlierIndices)
			if len(moved) == 0 {
				continue
			}
			clusters[idx].Articles = keep
			clusters[idx].Centroid = meanVector(articleVectors(keep))
			clusters[idx].DomCate = dominantCate(keep)
			clusters[tgt].Articles = append(clusters[tgt].Articles, moved...)
			clusters[tgt].Centroid = meanVector(articleVectors(clusters[tgt].Articles))
			clusters[tgt].DomCate = dominantCate(clusters[tgt].Articles)
			slog.Debug("refine: move", "from", idx, "to", tgt, "articles", len(moved))

		case "split":
			if len(action.OutlierIndices) == 0 {
				continue
			}
			keep, outliers := partitionByIndex(clusters[idx].Articles, action.OutlierIndices)
			if len(outliers) == 0 || len(keep) == 0 {
				continue
			}
			clusters[idx].Articles = keep
			clusters[idx].Centroid = meanVector(articleVectors(keep))
			clusters[idx].DomCate = dominantCate(keep)
			clusters = append(clusters, Cluster{
				Articles: outliers,
				Centroid: meanVector(articleVectors(outliers)),
				DomCate:  dominantCate(outliers),
			})
			active = append(active, true)
			n = len(clusters)
			slog.Debug("refine: split", "cluster", idx, "outliers", len(outliers))
		}
	}

	result := make([]Cluster, 0, len(clusters))
	for i, c := range clusters {
		if active[i] && len(c.Articles) > 0 {
			result = append(result, c)
		}
	}
	return result
}

// partitionByIndex splits articles into (keep, matched) based on 0-based indices.
func partitionByIndex(articles []db.Article, indices []int) (keep, matched []db.Article) {
	indexSet := make(map[int]bool, len(indices))
	for _, i := range indices {
		indexSet[i] = true
	}
	for i, a := range articles {
		if indexSet[i] {
			matched = append(matched, a)
		} else {
			keep = append(keep, a)
		}
	}
	return
}
