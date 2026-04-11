package db

import (
	"fmt"
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
		var f float64
		fmt.Sscanf(p, "%f", &f)
		result = append(result, float32(f))
	}
	return result
}
