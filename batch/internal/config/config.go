package config

import (
	"github.com/newsprism/shared/config"
)

// BERTopicConfig holds parameters for the BERTopic subprocess.
type BERTopicConfig struct {
	PythonPath        string
	ScriptPath        string
	MinClusterSize    int
	UMAPComponents    int
	TimeoutSec        int
	FallbackThreshold float64
}

type Config struct {
	config.SharedConfig
	GroupClusterThreshold  float64
	EmbedClassifyThreshold float64
	TimeDecayHalfLifeHours float64
	RefineIntraThreshold   float64 // クラスタ内min類似度がこれ以上なら coherent とみなしてrefineスキップ
	RefineInterThreshold   float64 // クラスタ間centroid類似度がこれ以上ならmerge候補としてrefine対象
	SkipRefine             bool    // trueのときrefineステップを完全にスキップ
	UseBERTopic            bool    // trueのときBERTopicクラスタリングを使用
	BERTopicConfig         BERTopicConfig
	BatchPort              string
	FeedsYAMLPath          string
}

func Load() Config {
	groupThreshold := config.GetFloat("GROUP_CLUSTER_THRESHOLD", 0.91)
	return Config{
		SharedConfig:           config.LoadShared(),
		GroupClusterThreshold:  groupThreshold,
		EmbedClassifyThreshold: config.GetFloat("EMBED_CLASSIFY_THRESHOLD", 0.9),
		TimeDecayHalfLifeHours: config.GetFloat("TIME_DECAY_HALF_LIFE_HOURS", 12.0),
		RefineIntraThreshold:   config.GetFloat("REFINE_INTRA_THRESHOLD", 0.93),
		RefineInterThreshold:   config.GetFloat("REFINE_INTER_THRESHOLD", 0.92),
		SkipRefine:             config.GetBool("SKIP_REFINE", false),
		UseBERTopic:            config.GetBool("USE_BERTOPIC", false),
		BERTopicConfig: BERTopicConfig{
			PythonPath:        config.GetEnv("BERTOPIC_PYTHON_PATH", "python3"),
			ScriptPath:        config.GetEnv("BERTOPIC_SCRIPT_PATH", "../scripts/bertopic_cluster.py"),
			MinClusterSize:    int(config.GetFloat("BERTOPIC_MIN_CLUSTER_SIZE", 2)),
			UMAPComponents:    int(config.GetFloat("BERTOPIC_UMAP_COMPONENTS", 15)),
			TimeoutSec:        int(config.GetFloat("BERTOPIC_TIMEOUT_SEC", 120)),
			FallbackThreshold: groupThreshold,
		},
		BatchPort:     config.GetEnv("BATCH_PORT", "8090"),
		FeedsYAMLPath: config.GetEnv("FEEDS_YAML_PATH", "feeds.yaml"),
	}
}
