package llm

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type EmbedClient struct {
	BaseURL string
	Model   string
	client  *http.Client
}

func NewEmbedClient(baseURL, model string) *EmbedClient {
	return &EmbedClient{
		BaseURL: baseURL,
		Model:   model,
		client:  &http.Client{Timeout: 60 * time.Second},
	}
}

// EmbedBatch vectorizes texts, sending them one at a time.
// Returns nil slice elements for failed items.
func (c *EmbedClient) EmbedBatch(ctx context.Context, texts []string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}

	vecs := make([][]float32, len(texts))
	for i, t := range texts {
		// ruri-v3 context limit: 512 tokens. Japanese ≈ 1-2 tokens/rune.
		// "文章: " prefix costs ~3 tokens, so cap at 400 runes.
		if r := []rune(t); len(r) > 400 {
			t = string(r[:400])
		}
		// ruri-v3 requires "文章: " prefix for document embeddings
		vec, err := c.embedOne(ctx, "文章: "+t)
		if err != nil {
			return nil, fmt.Errorf("text %d: %w", i, err)
		}
		vecs[i] = vec
	}
	return vecs, nil
}

func (c *EmbedClient) embedOne(ctx context.Context, input string) ([]float32, error) {
	body, err := json.Marshal(map[string]any{
		"model": c.Model,
		"input": input,
	})
	if err != nil {
		return nil, fmt.Errorf("marshal embed request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", c.BaseURL+"/v1/embeddings", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("embed request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("embed HTTP %d: %s", resp.StatusCode, body)
	}

	var result struct {
		Data []struct {
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	if len(result.Data) == 0 {
		return nil, fmt.Errorf("empty embedding response")
	}
	return result.Data[0].Embedding, nil
}
