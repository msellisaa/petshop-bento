package main

import (
  "crypto/sha256"
  "crypto/subtle"
  "database/sql"
  "encoding/hex"
  "encoding/json"
  "net"
  "net/http"
  "os"
  "strings"
  "sync"
  "time"
)

type TrackingUpdate struct {
  ID        string  `json:"id"`
  OrderID   string  `json:"order_id"`
  DriverID  string  `json:"driver_id"`
  Status    string  `json:"status"`
  Lat       float64 `json:"lat"`
  Lng       float64 `json:"lng"`
  SpeedKph  float64 `json:"speed_kph"`
  Heading   float64 `json:"heading"`
  CreatedAt time.Time `json:"created_at"`
}

type rateLimiter struct {
  mu     sync.Mutex
  hits   map[string][]time.Time
  limit  int
  window time.Duration
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
  return &rateLimiter{hits: map[string][]time.Time{}, limit: limit, window: window}
}

func (r *rateLimiter) allow(key string) bool {
  r.mu.Lock()
  defer r.mu.Unlock()
  now := time.Now()
  list := r.hits[key]
  kept := list[:0]
  for _, t := range list {
    if now.Sub(t) <= r.window {
      kept = append(kept, t)
    }
  }
  if len(kept) >= r.limit {
    r.hits[key] = kept
    return false
  }
  kept = append(kept, now)
  r.hits[key] = kept
  return true
}

var trackReadLimiter = newRateLimiter(60, time.Minute)
var trackWriteLimiter = newRateLimiter(120, time.Minute)

func deliveryTrackHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    if !trackWriteLimiter.allow(clientIP(r)) {
      writeJSON(w, http.StatusTooManyRequests, errMsg("rate limit"))
      return
    }
    if !driverAuthorized(r) {
      writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
      return
    }
    var req TrackingUpdate
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
      return
    }
    if strings.TrimSpace(req.OrderID) == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("order_id required"))
      return
    }
    if req.Lat == 0 && req.Lng == 0 {
      writeJSON(w, http.StatusBadRequest, errMsg("lat and lng required"))
      return
    }
    if req.Status == "" {
      req.Status = "ON_ROUTE"
    }
    _, err := db.Exec(
      `INSERT INTO delivery_tracking (order_id, driver_id, status, lat, lng, speed_kph, heading)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      req.OrderID, req.DriverID, req.Status, req.Lat, req.Lng, req.SpeedKph, req.Heading,
    )
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
      return
    }
    writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
  }
}

func deliveryTrackStatusHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    orderPath := strings.TrimPrefix(r.URL.Path, "/delivery/track/")
    if strings.HasSuffix(orderPath, "/stream") {
      orderID := strings.TrimSuffix(orderPath, "/stream")
      orderID = strings.TrimSuffix(orderID, "/")
      deliveryTrackStreamHandler(db, orderID, w, r)
      return
    }
    orderID := orderPath
    if strings.TrimSpace(orderID) == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("missing order_id"))
      return
    }
    if !trackReadLimiter.allow(clientIP(r)) {
      writeJSON(w, http.StatusTooManyRequests, errMsg("rate limit"))
      return
    }
    token := r.URL.Query().Get("token")
    if ok := checkTrackingToken(db, orderID, token); !ok {
      writeJSON(w, http.StatusUnauthorized, errMsg("invalid token"))
      return
    }
    var latest TrackingUpdate
    err := db.QueryRow(
      `SELECT id, order_id, driver_id, status, lat, lng, speed_kph, heading, created_at
       FROM delivery_tracking WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
      orderID,
    ).Scan(&latest.ID, &latest.OrderID, &latest.DriverID, &latest.Status, &latest.Lat, &latest.Lng, &latest.SpeedKph, &latest.Heading, &latest.CreatedAt)
    if err != nil && err != sql.ErrNoRows {
      writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
      return
    }

    rows, err := db.Query(
      `SELECT id, order_id, driver_id, status, lat, lng, speed_kph, heading, created_at
       FROM delivery_tracking WHERE order_id = $1 ORDER BY created_at DESC LIMIT 6`,
      orderID,
    )
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
      return
    }
    defer rows.Close()

    trail := make([]TrackingUpdate, 0)
    for rows.Next() {
      var item TrackingUpdate
      if err := rows.Scan(&item.ID, &item.OrderID, &item.DriverID, &item.Status, &item.Lat, &item.Lng, &item.SpeedKph, &item.Heading, &item.CreatedAt); err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      trail = append(trail, item)
    }

    var out any
    if err == sql.ErrNoRows {
      out = map[string]any{"latest": nil, "trail": trail}
    } else {
      out = map[string]any{"latest": latest, "trail": trail}
    }
    logTrackingAccess(db, orderID, r)
    writeJSON(w, http.StatusOK, out)
  }
}

func deliveryTrackStreamHandler(db *sql.DB, orderID string, w http.ResponseWriter, r *http.Request) {
  if strings.TrimSpace(orderID) == "" {
    writeJSON(w, http.StatusBadRequest, errMsg("missing order_id"))
    return
  }
  if !trackReadLimiter.allow(clientIP(r)) {
    writeJSON(w, http.StatusTooManyRequests, errMsg("rate limit"))
    return
  }
  token := r.URL.Query().Get("token")
  if ok := checkTrackingToken(db, orderID, token); !ok {
    writeJSON(w, http.StatusUnauthorized, errMsg("invalid token"))
    return
  }
  flusher, ok := w.(http.Flusher)
  if !ok {
    writeJSON(w, http.StatusInternalServerError, errMsg("stream not supported"))
    return
  }
  w.Header().Set("Content-Type", "text/event-stream")
  w.Header().Set("Cache-Control", "no-cache")
  w.Header().Set("Connection", "keep-alive")

  ticker := time.NewTicker(2 * time.Second)
  defer ticker.Stop()

  var lastSent time.Time
  ctx := r.Context()
  logTrackingAccess(db, orderID, r)
  for {
    select {
    case <-ctx.Done():
      return
    case <-ticker.C:
      var item TrackingUpdate
      err := db.QueryRow(
        `SELECT id, order_id, driver_id, status, lat, lng, speed_kph, heading, created_at
         FROM delivery_tracking WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`,
        orderID,
      ).Scan(&item.ID, &item.OrderID, &item.DriverID, &item.Status, &item.Lat, &item.Lng, &item.SpeedKph, &item.Heading, &item.CreatedAt)
      if err != nil {
        continue
      }
      if !item.CreatedAt.After(lastSent) {
        continue
      }
      lastSent = item.CreatedAt
      payload, _ := json.Marshal(item)
      _, _ = w.Write([]byte("event: tracking\n"))
      _, _ = w.Write([]byte("data: "))
      _, _ = w.Write(payload)
      _, _ = w.Write([]byte("\n\n"))
      flusher.Flush()
    }
  }
}

func driverAuthorized(r *http.Request) bool {
  token := r.Header.Get("X-Driver-Token")
  hash := strings.TrimSpace(os.Getenv("CORE_DRIVER_TOKEN_HASH"))
  plain := strings.TrimSpace(os.Getenv("CORE_DRIVER_TOKEN"))
  if hash == "" && plain == "" {
    return true
  }
  if hash != "" {
    sum := sha256.Sum256([]byte(token))
    expected, err := hex.DecodeString(hash)
    if err != nil || len(expected) != len(sum) {
      return false
    }
    return subtle.ConstantTimeCompare(sum[:], expected) == 1
  }
  return subtle.ConstantTimeCompare([]byte(token), []byte(plain)) == 1
}

func clientIP(r *http.Request) string {
  forwarded := r.Header.Get("X-Forwarded-For")
  if forwarded != "" {
    parts := strings.Split(forwarded, ",")
    return strings.TrimSpace(parts[0])
  }
  host, _, err := net.SplitHostPort(r.RemoteAddr)
  if err != nil {
    return r.RemoteAddr
  }
  return host
}

func checkTrackingToken(db *sql.DB, orderID, token string) bool {
  var expected sql.NullString
  err := db.QueryRow(`SELECT tracking_token FROM orders WHERE id = $1`, orderID).Scan(&expected)
  if err != nil {
    return false
  }
  if !expected.Valid || strings.TrimSpace(expected.String) == "" {
    return true
  }
  return token != "" && token == expected.String
}

func logTrackingAccess(db *sql.DB, orderID string, r *http.Request) {
  ip := clientIP(r)
  ua := r.UserAgent()
  _, _ = db.Exec(`INSERT INTO delivery_tracking_access (order_id, ip_address, user_agent) VALUES ($1,$2,$3)`,
    orderID, ip, ua)
}
