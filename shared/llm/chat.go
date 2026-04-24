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

type ChatClient struct {
	BaseURL string
	Model   string
	client  *http.Client
}

func NewChatClient(baseURL, model string) *ChatClient {
	return &ChatClient{
		BaseURL: baseURL,
		Model:   model,
		client:  &http.Client{Timeout: 180 * time.Second},
	}
}

type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// Complete sends a chat completion request and returns the assistant message content.
// maxTokens controls the response length; pass 0 to use the default (2048).
func (c *ChatClient) Complete(ctx context.Context, system, user string, maxTokens int) (string, error) {
	if maxTokens <= 0 {
		maxTokens = 2048
	}
	body, err := json.Marshal(map[string]any{
		"model": c.Model,
		"messages": []Message{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
		"stream":         false,
		"temperature":    0.3,
		"max_tokens":     maxTokens,
		"repeat_penalty": 1.1,
	})
	if err != nil {
		return "", fmt.Errorf("marshal chat request: %w", err)
	}
	return c.doRequest(ctx, body)
}

// CompleteJSON sends a chat completion request with JSON response format.
// Use for structured classification tasks (temperature=0.1).
func (c *ChatClient) CompleteJSON(ctx context.Context, system, user string) (string, error) {
	body, err := json.Marshal(map[string]any{
		"model": c.Model,
		"messages": []Message{
			{Role: "system", Content: system},
			{Role: "user", Content: user},
		},
		"stream":          false,
		"temperature":     0.1,
		"max_tokens":      8192,
		"response_format": map[string]string{"type": "json_object"},
	})
	if err != nil {
		return "", fmt.Errorf("marshal chat request: %w", err)
	}
	return c.doRequest(ctx, body)
}

func (c *ChatClient) doRequest(ctx context.Context, body []byte) (string, error) {
	req, err := http.NewRequestWithContext(ctx, "POST", c.BaseURL+"/v1/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.client.Do(req)
	if err != nil {
		return "", fmt.Errorf("chat request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return "", fmt.Errorf("chat HTTP %d: %s", resp.StatusCode, string(errBody))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no choices in response")
	}
	return result.Choices[0].Message.Content, nil
}
