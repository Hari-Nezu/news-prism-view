package config

import (
	"os"
	"strconv"
)

type SharedConfig struct {
	DatabaseURL            string
	LLMBaseURL             string
	EmbedBaseURL           string
	RefineBaseURL          string
	LLMModel               string
	ClassifyModel          string
	RefineModel            string
	EmbedModel             string
	GroupClusterThreshold  float64
	EmbedClassifyThreshold float64
}

func LoadShared() SharedConfig {
	return SharedConfig{
		DatabaseURL:            GetEnv("DATABASE_URL", "postgresql://newsprism:newsprism@localhost:5432/newsprism"),
		LLMBaseURL:             GetEnv("LLM_BASE_URL", "http://127.0.0.1:8081"),
		EmbedBaseURL:           GetEnv("EMBED_BASE_URL", "http://127.0.0.1:8081"),
		RefineBaseURL:          GetEnv("REFINE_BASE_URL", "http://127.0.0.1:8082"),
		LLMModel:               GetEnv("LLM_MODEL", "gemma-4-E2B-it-Q8_0"),
		ClassifyModel:          GetEnv("CLASSIFY_MODEL", "gemma-4-E2B-it-Q8_0"),
		RefineModel:            GetEnv("REFINE_MODEL", "gemma-4-E2B-it-Q8_0"),
		EmbedModel:             GetEnv("EMBED_MODEL", "Targoyle/ruri-v3-310m-GGUF:Q8_0"),
		GroupClusterThreshold:  GetFloat("GROUP_CLUSTER_THRESHOLD", 0.91),
		EmbedClassifyThreshold: GetFloat("EMBED_CLASSIFY_THRESHOLD", 0.8),
	}
}

func GetEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func GetBool(key string, def bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return def
}

func GetFloat(key string, def float64) float64 {
	if v := os.Getenv(key); v != "" {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return def
}
