package youtube

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/mmcdole/gofeed"
)

type ChannelConfig struct {
	ID        string
	Name      string
	ChannelID string
	MaxVideos int
}

// VideoItem matches the frontend RssFeedItem shape.
type VideoItem struct {
	Title       string  `json:"title"`
	URL         string  `json:"url"`
	Source      string  `json:"source"`
	Summary     *string `json:"summary,omitempty"`
	PublishedAt *string `json:"publishedAt,omitempty"`
	ImageURL    *string `json:"imageUrl,omitempty"`
}

// AllChannels mirrors src/lib/config/youtube-channel-configs.ts.
var AllChannels = []ChannelConfig{
	{ID: "tbsnews", Name: "TBS NEWS DIG", ChannelID: "UC6AG81pAkf6Lbi_1VC5NmPA", MaxVideos: 5},
	{ID: "annnews", Name: "テレ朝news", ChannelID: "UCGCZAYq5Xxojl_tSXcVJhiQ", MaxVideos: 5},
	{ID: "ntv", Name: "日テレNEWS", ChannelID: "UCuTAXTexrhetbOe3zgskJBQ", MaxVideos: 5},
	{ID: "fnn", Name: "FNNプライムオンライン", ChannelID: "UCE_pHCKVR4m16EfSSEaTBJg", MaxVideos: 5},
	{ID: "pivot", Name: "PIVOT", ChannelID: "UC8yHePe_RgUBE-waRWy6olw", MaxVideos: 5},
	{ID: "rehacq", Name: "ReHacQ", ChannelID: "UCG_oqDSlIYEspNpd2H4zWhw", MaxVideos: 5},
	{ID: "bunkahouse", Name: "文化人放送局", ChannelID: "UCCSPJbVEuAGRFDPLPBQRBEg", MaxVideos: 5},
	{ID: "clp", Name: "Choose Life Project", ChannelID: "UCe7nBCBFVzFDLnM3S7L2V6Q", MaxVideos: 5},
	{ID: "takahashi", Name: "高橋洋一チャンネル", ChannelID: "UCECfnRv8lSbn90zCAJWC7cg", MaxVideos: 5},
	{ID: "ichimanmasamitsu", Name: "一月万冊", ChannelID: "UCMirnQIiZsqNHaYXSXFQ17Q", MaxVideos: 5},
}

// FetchChannels fetches YouTube RSS feeds for the given config IDs in parallel.
func FetchChannels(ctx context.Context, ids []string) []VideoItem {
	byID := make(map[string]ChannelConfig, len(AllChannels))
	for _, c := range AllChannels {
		byID[c.ID] = c
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	var items []VideoItem

	parser := gofeed.NewParser()
	parser.Client.Timeout = 10 * time.Second

	for _, id := range ids {
		cfg, ok := byID[id]
		if !ok {
			continue
		}
		wg.Add(1)
		go func(cfg ChannelConfig) {
			defer wg.Done()
			feedURL := fmt.Sprintf("https://www.youtube.com/feeds/videos.xml?channel_id=%s", cfg.ChannelID)
			feed, err := parser.ParseURLWithContext(feedURL, ctx)
			if err != nil {
				return
			}
			limit := cfg.MaxVideos
			if limit > len(feed.Items) {
				limit = len(feed.Items)
			}
			mu.Lock()
			defer mu.Unlock()
			for _, item := range feed.Items[:limit] {
				vi := VideoItem{
					Title:  item.Title,
					URL:    item.Link,
					Source: cfg.Name,
				}
				if item.Description != "" {
					s := item.Description
					vi.Summary = &s
				}
				if item.PublishedParsed != nil {
					s := item.PublishedParsed.Format(time.RFC3339)
					vi.PublishedAt = &s
				}
				if item.Image != nil && item.Image.URL != "" {
					s := item.Image.URL
					vi.ImageURL = &s
				}
				items = append(items, vi)
			}
		}(cfg)
	}

	wg.Wait()
	return items
}
