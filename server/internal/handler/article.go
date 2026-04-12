package handler
import "net/http"
func (d *Deps) FetchArticle(w http.ResponseWriter, r *http.Request) { writeError(w, "Not implemented", 501) }
