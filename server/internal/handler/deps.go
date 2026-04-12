package handler

import (
	"github.com/newsprism/shared/config"
	"github.com/newsprism/shared/db"
	"github.com/newsprism/shared/llm"
)

type Deps struct {
	Pool           *db.Pool
	ChatClient     *llm.ChatClient
	ClassifyClient *llm.ChatClient
	EmbedClient    *llm.EmbedClient
	Config         config.SharedConfig
	BatchServerURL string
}
