package config

import (
	"github.com/newsprism/shared/config"
)

type Config struct {
	config.SharedConfig
	GroupClusterThreshold  float64
	EmbedClassifyThreshold float64
	TimeDecayHalfLifeHours float64
	BatchPort              string
	FeedsYAMLPath          string
}

func Load() Config {
	return Config{
		SharedConfig:           config.LoadShared(),
		GroupClusterThreshold:  config.GetFloat("GROUP_CLUSTER_THRESHOLD", 0.87),
		EmbedClassifyThreshold: config.GetFloat("EMBED_CLASSIFY_THRESHOLD", 0.5),
		TimeDecayHalfLifeHours: config.GetFloat("TIME_DECAY_HALF_LIFE_HOURS", 12.0),
		BatchPort:              config.GetEnv("BATCH_PORT", "8090"),
		FeedsYAMLPath:          config.GetEnv("FEEDS_YAML_PATH", "feeds.yaml"),
	}
}
