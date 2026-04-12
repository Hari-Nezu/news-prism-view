package sse

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type Writer struct {
	w       http.ResponseWriter
	flusher http.Flusher
}

func NewWriter(w http.ResponseWriter) *Writer {
	f, _ := w.(http.Flusher)
	return &Writer{w: w, flusher: f}
}

func (s *Writer) Init() {
	s.w.Header().Set("Content-Type", "text/event-stream")
	s.w.Header().Set("Cache-Control", "no-cache")
	s.w.Header().Set("Connection", "keep-alive")
	s.w.Header().Set("Access-Control-Allow-Origin", "*")
}

func (s *Writer) Send(event string, data any) error {
	b, err := json.Marshal(data)
	if err != nil {
		return err
	}
	fmt.Fprintf(s.w, "event: %s\ndata: %s\n\n", event, string(b))
	if s.flusher != nil {
		s.flusher.Flush()
	}
	return nil
}

func (s *Writer) Comment(msg string) {
	fmt.Fprintf(s.w, ": %s\n\n", msg)
	if s.flusher != nil {
		s.flusher.Flush()
	}
}
