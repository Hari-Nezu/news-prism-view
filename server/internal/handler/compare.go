package handler
import "net/http"
func (d *Deps) Compare(w http.ResponseWriter, r *http.Request) { writeError(w, "Not implemented", 501) }
func (d *Deps) CompareAnalyze(w http.ResponseWriter, r *http.Request) { writeError(w, "Not implemented", 501) }
