package main

import (
  "database/sql"
  "encoding/json"
  "net/http"
  "strings"
)

type EventRequest struct {
  SessionID string          `json:"session_id"`
  EventType string          `json:"event_type"`
  ProductID string          `json:"product_id"`
  Metadata  json.RawMessage `json:"metadata"`
}

var allowedEvents = map[string]bool{
  "view_product": true,
  "add_to_cart":  true,
  "remove_cart":  true,
  "checkout":     true,
  "promo_click":  true,
}

func eventsHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    var req EventRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
      return
    }
    req.EventType = strings.TrimSpace(req.EventType)
    if req.EventType == "" || !allowedEvents[req.EventType] {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid event_type"))
      return
    }
    if req.SessionID == "" {
      req.SessionID = r.Header.Get("X-Session-Id")
    }
    if req.ProductID == "" && req.EventType != "checkout" && req.EventType != "promo_click" {
      writeJSON(w, http.StatusBadRequest, errMsg("product_id required"))
      return
    }

    userID := ""
    if token := r.Header.Get("X-Auth-Token"); token != "" {
      if uid, err := getUserIDFromToken(db, r); err == nil {
        userID = uid
      }
    }
    if userID == "" && req.SessionID == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("session_id required"))
      return
    }

    var meta any = nil
    if len(req.Metadata) > 0 {
      meta = req.Metadata
    }

    _, err := db.Exec(
      `INSERT INTO events (user_id, session_id, event_type, product_id, metadata)
       VALUES ($1,$2,$3,$4,$5)`,
      nullIfEmpty(userID), nullIfEmpty(req.SessionID), req.EventType, nullIfEmpty(req.ProductID), meta,
    )
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
      return
    }
    writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
  }
}
