package config

import (
	"os"

	"github.com/newsprism/shared/config"
)

type Config struct {
	config.SharedConfig
	BatchPort     string
	FeedsYAMLPath string
}

func Load() Config {
	return Config{
		SharedConfig:  config.LoadShared(),
		BatchPort:     getEnv("BATCH_PORT", "8090"),
		FeedsYAMLPath: getEnv("FEEDS_YAML_PATH", "feeds.yaml"),
	}
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
