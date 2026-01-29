package main

import (
  "database/sql"
  "io"
  "net/http"
  "os"
  "path/filepath"
  "strings"
)

func productImageUploadHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    if _, err := requireRoles(db, r, "owner", "admin"); err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
      return
    }
    id := strings.TrimPrefix(r.URL.Path, "/admin/products/")
    id = strings.TrimSuffix(id, "/image")
    if id == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("missing product id"))
      return
    }

    if err := r.ParseMultipartForm(5 << 20); err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid form"))
      return
    }
    file, header, err := r.FormFile("image")
    if err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("image required"))
      return
    }
    defer file.Close()

    ext := strings.ToLower(filepath.Ext(header.Filename))
    if ext == "" {
      ext = ".jpg"
    }
    if ext != ".jpg" && ext != ".jpeg" && ext != ".png" && ext != ".webp" {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid file type"))
      return
    }

    if err := os.MkdirAll("uploads", 0755); err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("upload dir error"))
      return
    }

    filename := id + "_" + generateToken()[:8] + ext
    path := filepath.Join("uploads", filename)
    out, err := os.Create(path)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("save failed"))
      return
    }
    defer out.Close()
    if _, err := io.Copy(out, file); err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("save failed"))
      return
    }

    url := "/uploads/" + filename
    _, err = db.Exec(`UPDATE products SET image_url = $1 WHERE id = $2`, url, id)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("update failed"))
      return
    }

    writeJSON(w, http.StatusOK, map[string]string{"image_url": url})
  }
}
