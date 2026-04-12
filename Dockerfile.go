# ── ビルドステージ ──────────────────────────────────────────
FROM golang:1.25-alpine AS builder
WORKDIR /workspace

# go.work と各モジュールの go.mod/go.sum を先にコピー（レイヤーキャッシュ効率化）
COPY go.work go.work.sum ./
COPY shared/go.mod shared/go.sum ./shared/
COPY batch/go.mod batch/go.sum ./batch/
COPY server/go.mod server/go.sum ./server/

RUN cd shared && go mod download && \
    cd ../batch && go mod download && \
    cd ../server && go mod download

# ソースコピー & ビルド
COPY shared/ ./shared/
COPY batch/  ./batch/
COPY server/ ./server/

RUN CGO_ENABLED=0 go build -o /bin/newsprism-batch  ./batch/cmd/newsprism-batch
RUN CGO_ENABLED=0 go build -o /bin/newsprism-server ./server/cmd/newsprism-server

# ── batch ランタイム ─────────────────────────────────────────
FROM alpine:3.20 AS batch
RUN apk add --no-cache ca-certificates tzdata
COPY --from=builder /bin/newsprism-batch /usr/local/bin/newsprism-batch
COPY batch/feeds.yaml /etc/newsprism/feeds.yaml
ENV FEEDS_YAML_PATH=/etc/newsprism/feeds.yaml
EXPOSE 8090
CMD ["newsprism-batch", "serve"]

# ── server ランタイム ────────────────────────────────────────
FROM alpine:3.20 AS server
RUN apk add --no-cache ca-certificates tzdata curl
COPY --from=builder /bin/newsprism-server /usr/local/bin/newsprism-server
EXPOSE 8091
HEALTHCHECK --interval=10s --timeout=3s \
  CMD curl -f http://localhost:8091/api/config || exit 1
CMD ["newsprism-server"]
