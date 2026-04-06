package config

import (
	"os"
	"strconv"
)

type Config struct {
	DatabaseURL            string
	LLMBaseURL             string
	LLMModel               string
	ClassifyModel          string
	EmbedModel             string
	GroupClusterThreshold  float64
	EmbedClassifyThreshold float64
	TimeDecayHalfLifeHours float64
	BatchPort              string
	FeedsYAMLPath          string
}

func Load() Config {
	return Config{
		DatabaseURL:            getEnv("DATABASE_URL", "postgresql://newsprism:newsprism@localhost:5432/newsprism"),
		LLMBaseURL:             getEnv("LLM_BASE_URL", "http://localhost:8081"),
		LLMModel:               getEnv("LLM_MODEL", "gemma-4-E4B-it-Q8_0"),
		ClassifyModel:          getEnv("CLASSIFY_MODEL", "gemma-4-E4B-it-Q8_0"),
		EmbedModel:             getEnv("EMBED_MODEL", "Targoyle/ruri-v3-310m-GGUF:Q8_0"),
		GroupClusterThreshold:  getFloat("GROUP_CLUSTER_THRESHOLD", 0.87),
		EmbedClassifyThreshold: getFloat("EMBED_CLASSIFY_THRESHOLD", 0.5),
		TimeDecayHalfLifeHours: getFloat("TIME_DECAY_HALF_LIFE_HOURS", 12.0),
		BatchPort:              getEnv("BATCH_PORT", "8090"),
		FeedsYAMLPath:          getEnv("FEEDS_YAML_PATH", "feeds.yaml"),
	}
}

func getEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func getFloat(key string, def float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return def
}
