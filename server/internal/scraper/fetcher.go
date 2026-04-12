package scraper

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/PuerkitoBio/goquery"
)

var httpClient = &http.Client{Timeout: 10 * time.Second}

const maxBodySize = 5 << 20 // 5MB

func FetchArticleFromUrl(url string) (string, error) {
	resp, err := httpClient.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	limited := io.LimitReader(resp.Body, maxBodySize)
	doc, err := goquery.NewDocumentFromReader(limited)
	if err != nil {
		return "", err
	}

	var b strings.Builder
	// <article>があればその中の<p>のみ、なければbody直下の<p>を使う
	sel := doc.Find("article p")
	if sel.Length() == 0 {
		sel = doc.Find("p")
	}
	sel.Each(func(i int, s *goquery.Selection) {
		text := s.Text()
		if len(text) > 50 {
			b.WriteString(text)
			b.WriteByte('\n')
		}
	})

	content := b.String()
	if content == "" {
		return "", fmt.Errorf("could not extract content")
	}
	return content, nil
}
