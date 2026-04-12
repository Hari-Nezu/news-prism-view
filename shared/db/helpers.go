package db

import (
	"strconv"
	"strings"
)

func nullStr(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func parseVectorStr(s string) []float32 {
	s = strings.TrimPrefix(s, "[")
	s = strings.TrimSuffix(s, "]")
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	result := make([]float32, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if f, err := strconv.ParseFloat(p, 32); err == nil {
			result = append(result, float32(f))
		}
	}
	return result
}
