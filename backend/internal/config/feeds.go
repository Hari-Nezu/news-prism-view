package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

type FeedConfig struct {
	ID              string `yaml:"id"`
	Name            string `yaml:"name"`
	URL             string `yaml:"url"`
	Type            string `yaml:"type"` // "rss" | "google-news"
	Category        string `yaml:"category"`
	FilterPolitical bool   `yaml:"filter_political"`
	DefaultEnabled  bool   `yaml:"default_enabled"`
	CanonicalSource string `yaml:"canonical_source"`
}

type FeedsFile struct {
	Feeds []FeedConfig `yaml:"feeds"`
}

func LoadFeeds(path string) ([]FeedConfig, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var f FeedsFile
	if err := yaml.Unmarshal(data, &f); err != nil {
		return nil, err
	}
	return f.Feeds, nil
}

func DefaultEnabledFeeds(feeds []FeedConfig) []FeedConfig {
	var result []FeedConfig
	for _, f := range feeds {
		if f.DefaultEnabled {
			result = append(result, f)
		}
	}
	return result
}
