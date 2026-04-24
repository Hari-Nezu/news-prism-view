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

const embedChunkSize = 32

// Embed vectorizes a single text string using query prefix.
func (c *EmbedClient) Embed(ctx context.Context, text string) ([]float32, error) {
	vecs, err := c.EmbedBatchWithPrefix(ctx, []string{text}, "query: ")
	if err != nil || len(vecs) == 0 {
		return nil, err
	}
	return vecs[0], nil
}

// EmbedBatch vectorizes texts in chunks of embedChunkSize per HTTP request.
// Uses the clustering instruction prefix for article/document embeddings.
// Returns nil slice elements for failed items.
func (c *EmbedClient) EmbedBatch(ctx context.Context, texts []string) ([][]float32, error) {
	return c.EmbedBatchWithPrefix(ctx, texts, "Instruct: ニュース記事を具体的な出来事・事件単位でクラスタリングする\nQuery: ")
}

// EmbedBatchWithPrefix vectorizes texts using the specified prefix.
// e5-instruct format: "query: " for queries, "Instruct: ...\nQuery: " for task-specific.
func (c *EmbedClient) EmbedBatchWithPrefix(ctx context.Context, texts []string, prefix string) ([][]float32, error) {
	if len(texts) == 0 {
		return nil, nil
	}

	// Normalize: prefix + truncate
	prepared := make([]string, len(texts))
	for i, t := range texts {
		if r := []rune(t); len(r) > 400 {
			t = string(r[:400])
		}
		prepared[i] = prefix + t
	}

	vecs := make([][]float32, len(texts))
	for start := 0; start < len(prepared); start += embedChunkSize {
		end := start + embedChunkSize
		if end > len(prepared) {
			end = len(prepared)
		}
		chunk := prepared[start:end]
		got, err := c.embedBatchRequest(ctx, chunk)
		if err != nil {
			return nil, fmt.Errorf("chunk %d-%d: %w", start, end, err)
		}
		copy(vecs[start:end], got)
	}
	return vecs, nil
}

func (c *EmbedClient) embedBatchRequest(ctx context.Context, inputs []string) ([][]float32, error) {
	body, err := json.Marshal(map[string]any{
		"model": c.Model,
		"input": inputs,
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
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("embed HTTP %d: %s", resp.StatusCode, b)
	}

	var result struct {
		Data []struct {
			Index     int       `json:"index"`
			Embedding []float32 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	if len(result.Data) == 0 {
		return nil, fmt.Errorf("empty embedding response")
	}

	vecs := make([][]float32, len(inputs))
	for _, d := range result.Data {
		if d.Index < len(vecs) {
			vecs[d.Index] = d.Embedding
		}
	}
	return vecs, nil
}
