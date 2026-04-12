package handler

import "net/http"

func (d *Deps) Config_(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, d.Config)
}
