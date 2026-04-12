package rss

import (
	"strings"

	"github.com/mmcdole/gofeed"
)

func FilterByKeyword(items []*gofeed.Item, keyword string) []*gofeed.Item {
	if keyword == "" {
		return items
	}
	keyword = strings.ToLower(keyword)
	var matched []*gofeed.Item
	for _, item := range items {
		if strings.Contains(strings.ToLower(item.Title), keyword) ||
			strings.Contains(strings.ToLower(item.Description), keyword) {
			matched = append(matched, item)
		}
	}
	return matched
}
