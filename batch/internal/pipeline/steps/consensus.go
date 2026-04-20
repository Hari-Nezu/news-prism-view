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

// CoveragePoint は1つの報道ポイントとそれを報じたメディアのセット。
// Sources の件数で全体一致・部分一致・単独報道を区別できる。
type CoveragePoint struct {
	Fact    string   `json:"fact"`
	Sources []string `json:"sources"`
}

// ConsensusResult はクラスタの報道ポイント一覧。
type ConsensusResult struct {
	Points []CoveragePoint `json:"points"`
}

type consensusGroupOutput struct {
	Index  int             `json:"index"`
	Points []CoveragePoint `json:"points"`
}

type consensusLLMOutput struct {
	Groups []consensusGroupOutput `json:"groups"`
}

const consensusChunkSize = 3

// consensusMaxArticlesPerCluster は1クラスタあたりLLMに送る記事の最大数。
const consensusMaxArticlesPerCluster = 8

// consensusSummaryMaxRunes はサマリーの最大文字数。
const consensusSummaryMaxRunes = 100

// ComputeConsensus は各クラスタについて、事実ごとにどのメディアが報じているかを LLM で抽出する。
// 1記事または単一媒体のクラスタはスキップ（空スライスを返す）。
func ComputeConsensus(ctx context.Context, chatClient *llm.ChatClient, clusters []Cluster) []ConsensusResult {
	results := make([]ConsensusResult, len(clusters))
	if len(clusters) == 0 {
		return results
	}

	type indexedCluster struct {
		orig int
		c    Cluster
	}

	var multi []indexedCluster
	for i, c := range clusters {
		if len(c.Articles) <= 1 || uniqueSourceCount(c.Articles) <= 1 {
			results[i] = ConsensusResult{Points: []CoveragePoint{}}
		} else {
			multi = append(multi, indexedCluster{i, c})
		}
	}

	slog.Info("consensus: LLM targets", "multi", len(multi), "skipped", len(clusters)-len(multi))

	for start := 0; start < len(multi); start += consensusChunkSize {
		end := start + consensusChunkSize
		if end > len(multi) {
			end = len(multi)
		}
		multiSlice := multi[start:end]
		chunk := make([]Cluster, len(multiSlice))
		for i, ic := range multiSlice {
			chunk[i] = ic.c
		}
		chunkResults := consensusChunk(ctx, chatClient, chunk, start)
		for i, ic := range multiSlice {
			results[ic.orig] = chunkResults[i]
		}
	}
	return results
}

func consensusChunk(ctx context.Context, chatClient *llm.ChatClient, clusters []Cluster, offset int) []ConsensusResult {
	fallback := func() []ConsensusResult {
		r := make([]ConsensusResult, len(clusters))
		for i := range r {
			r[i] = ConsensusResult{Points: []CoveragePoint{}}
		}
		return r
	}

	var sb strings.Builder
	for i, c := range clusters {
		fmt.Fprintf(&sb, "グループ%d\n", offset+i)
		articles := c.Articles
		if len(articles) > consensusMaxArticlesPerCluster {
			articles = articles[:consensusMaxArticlesPerCluster]
		}
		for _, a := range articles {
			summary := a.Summary
			if summary == "" {
				summary = "（要約なし）"
			} else if runes := []rune(summary); len(runes) > consensusSummaryMaxRunes {
				summary = string(runes[:consensusSummaryMaxRunes])
			}
			fmt.Fprintf(&sb, "  [%s] %s\n    要約: %s\n", a.Source, a.Title, summary)
		}
		sb.WriteString("\n")
	}

	t0 := time.Now()
	slog.Debug("consensus chunk start", "chunk_offset", offset, "clusters", len(clusters))

	content, err := chatClient.Complete(ctx, consensusSystemPrompt, sb.String(), 4096)
	if err != nil {
		slog.Warn("consensus LLM error, using empty results",
			"err", err, "chunk_offset", offset, "elapsed_ms", time.Since(t0).Milliseconds())
		return fallback()
	}

	slog.Debug("consensus chunk done", "chunk_offset", offset, "elapsed_ms", time.Since(t0).Milliseconds())

	extracted := extractJSON(content)
	var output consensusLLMOutput
	if err := json.Unmarshal([]byte(extracted), &output); err != nil {
		slog.Warn("consensus JSON parse error", "err", err, "chunk_offset", offset)
		return fallback()
	}

	resultMap := make(map[int]ConsensusResult, len(output.Groups))
	for _, g := range output.Groups {
		points := g.Points
		if points == nil {
			points = []CoveragePoint{}
		}
		resultMap[g.Index] = ConsensusResult{Points: points}
	}

	results := make([]ConsensusResult, len(clusters))
	for i := range clusters {
		if r, ok := resultMap[offset+i]; ok {
			results[i] = r
		} else {
			results[i] = ConsensusResult{Points: []CoveragePoint{}}
		}
	}
	return results
}

func uniqueSourceCount(articles []db.Article) int {
	seen := make(map[string]bool)
	for _, a := range articles {
		if a.Source != "" {
			seen[a.Source] = true
		}
	}
	return len(seen)
}
