package handler
import "net/http"
func (d *Deps) Analyze(w http.ResponseWriter, r *http.Request) { writeError(w, "Not implemented", 501) }
