package handler
import "net/http"
func (d *Deps) RSS(w http.ResponseWriter, r *http.Request) { writeError(w, "Not implemented", 501) }
