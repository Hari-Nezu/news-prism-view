package pipeline

import (
	"context"
	"math"
	"sort"
	"time"

	"github.com/newsprism/batch/internal/db"
)

// allBiasMediaSources is the full list of media outlets tracked for bias analysis.
var allBiasMediaSources = []string{
	"NHK", "朝日新聞", "毎日新聞", "読売新聞", "日本経済新聞",
	"産経新聞", "東京新聞", "時事通信", "共同通信",
	"TBSニュース", "テレビ朝日", "日本テレビ", "フジテレビ",
	"東洋経済オンライン", "ハフポスト日本版",
}

// Store saves clusters as a ProcessedSnapshot to the database.
func Store(ctx context.Context, pool *db.Pool, clusters []Cluster, titles []string, durationMs int, halfLifeHours float64) (string, error) {
	type ranked struct {
		cluster      Cluster
		title        string
		singleOutlet bool
		sourceCount  int
		finalScore   float64
	}

	now := time.Now()
	lambda := math.Log(2) / halfLifeHours

	items := make([]ranked, len(clusters))
	for i, c := range clusters {
		srcs := uniqueSources(c.Articles)
		sourceCount := len(srcs)

		// sourceScore: discrete tiers by unique source count
		var sourceScore float64
		switch {
		case sourceCount >= 3:
			sourceScore = 3.0
		case sourceCount == 2:
			sourceScore = 2.0
		default:
			sourceScore = 1.0
		}

		// timeScore: exponential decay from newest article in cluster
		ageHours := halfLifeHours // fallback if no publishedAt
		if newest := newestPublishedAt(c.Articles); newest != nil {
			ageHours = now.Sub(*newest).Hours()
			if ageHours < 0 {
				ageHours = 0
			}
		}
		timeScore := math.Exp(-lambda * ageHours)

		items[i] = ranked{
			cluster:      c,
			title:        titles[i],
			singleOutlet: sourceCount <= 1,
			sourceCount:  sourceCount,
			finalScore:   sourceScore * timeScore,
		}
	}

	// Sort: finalScore desc, then sourceCount desc, then article count desc
	sort.Slice(items, func(i, j int) bool {
		a, b := items[i], items[j]
		if a.finalScore != b.finalScore {
			return a.finalScore > b.finalScore
		}
		if a.sourceCount != b.sourceCount {
			return a.sourceCount > b.sourceCount
		}
		return len(a.cluster.Articles) > len(b.cluster.Articles)
	})

	groups := make([]db.SnapshotGroup, len(items))
	for i, r := range items {
		covered := uniqueSources(r.cluster.Articles)
		silent := silentSources(covered)

		groupItems := make([]db.SnapshotGroupItem, len(r.cluster.Articles))
		for j, a := range r.cluster.Articles {
			pubAt := ""
			if a.PublishedAt != nil {
				pubAt = a.PublishedAt.Format("2006-01-02T15:04:05Z")
			}
			groupItems[j] = db.SnapshotGroupItem{
				Title:       a.Title,
				URL:         a.URL,
				Source:      a.Source,
				Summary:     a.Summary,
				PublishedAt: pubAt,
				Category:    a.Category,
				Subcategory: a.Subcategory,
			}
		}

		groups[i] = db.SnapshotGroup{
			GroupTitle:   r.title,
			Category:     r.cluster.DomCat,
			Rank:         i + 1,
			SingleOutlet: r.singleOutlet,
			CoveredBy:    covered,
			SilentMedia:  silent,
			Items:        groupItems,
		}
	}

	snap := db.Snapshot{
		ArticleCount: totalArticles(clusters),
		GroupCount:   len(groups),
		DurationMs:   durationMs,
		Status:       "success",
		Groups:       groups,
	}

	return db.SaveSnapshot(ctx, pool, snap)
}

func newestPublishedAt(articles []db.Article) *time.Time {
	var newest *time.Time
	for _, a := range articles {
		if a.PublishedAt == nil {
			continue
		}
		if newest == nil || a.PublishedAt.After(*newest) {
			t := *a.PublishedAt
			newest = &t
		}
	}
	return newest
}

func uniqueSources(articles []db.Article) []string {
	seen := make(map[string]bool)
	var result []string
	for _, a := range articles {
		if a.Source != "" && !seen[a.Source] {
			seen[a.Source] = true
			result = append(result, a.Source)
		}
	}
	return result
}

func silentSources(covered []string) []string {
	coveredSet := make(map[string]bool, len(covered))
	for _, s := range covered {
		coveredSet[s] = true
	}
	var silent []string
	for _, s := range allBiasMediaSources {
		if !coveredSet[s] {
			silent = append(silent, s)
		}
	}
	return silent
}

func totalArticles(clusters []Cluster) int {
	n := 0
	for _, c := range clusters {
		n += len(c.Articles)
	}
	return n
}
