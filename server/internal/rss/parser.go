package rss

import (
	"context"
	"os"
	"sync"
	"time"

	"github.com/mmcdole/gofeed"
	"gopkg.in/yaml.v3"
)

type FeedConfig struct {
	ID   string `yaml:"id"`
	Name string `yaml:"name"`
	URL  string `yaml:"url"`
}

type feedsFile struct {
	Feeds []FeedConfig `yaml:"feeds"`
}

func LoadFeeds(path string) ([]FeedConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var f feedsFile
	if err := yaml.Unmarshal(data, &f); err != nil {
		return nil, err
	}
	return f.Feeds, nil
}

func FetchAllFeeds(ctx context.Context, configs []FeedConfig) ([]*gofeed.Item, error) {
	var wg sync.WaitGroup
	var mu sync.Mutex
	var allItems []*gofeed.Item

	parser := gofeed.NewParser()
	parser.Client.Timeout = 10 * time.Second

	for _, cfg := range configs {
		wg.Add(1)
		go func(c FeedConfig) {
			defer wg.Done()
			feed, err := parser.ParseURLWithContext(c.URL, ctx)
			if err != nil {
				return
			}
			mu.Lock()
			allItems = append(allItems, feed.Items...)
			mu.Unlock()
		}(cfg)
	}

	wg.Wait()
	return allItems, nil
}
