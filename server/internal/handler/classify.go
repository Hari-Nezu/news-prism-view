package handler
import "net/http"
func (d *Deps) Classify(w http.ResponseWriter, r *http.Request) { writeError(w, "Not implemented", 501) }
