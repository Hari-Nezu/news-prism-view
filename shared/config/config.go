package config

import (
	"os"
	"strconv"
)

type SharedConfig struct {
	DatabaseURL   string
	LLMBaseURL    string
	EmbedBaseURL  string
	LLMModel      string
	ClassifyModel string
	EmbedModel    string
}

func LoadShared() SharedConfig {
	return SharedConfig{
		DatabaseURL:   GetEnv("DATABASE_URL", "postgresql://newsprism:newsprism@localhost:5432/newsprism"),
		LLMBaseURL:    GetEnv("LLM_BASE_URL", "http://127.0.0.1:8081"),
		EmbedBaseURL:  GetEnv("EMBED_BASE_URL", "http://127.0.0.1:8081"),
		LLMModel:      GetEnv("LLM_MODEL", "gemma-4-E4B-it-Q8_0"),
		ClassifyModel: GetEnv("CLASSIFY_MODEL", "gemma-4-E4B-it-Q8_0"),
		EmbedModel:    GetEnv("EMBED_MODEL", "Targoyle/ruri-v3-310m-GGUF:Q8_0"),
	}
}

func GetEnv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
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
