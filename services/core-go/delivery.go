package main

import (
  "database/sql"
  "encoding/json"
  "math"
  "net/http"
  "os"
  "strings"
)

func deliveryZonesHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    rows, err := db.Query(`SELECT id, name, flat_fee, active FROM delivery_zones WHERE active = TRUE ORDER BY name`)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
      return
    }
    defer rows.Close()
    out := []map[string]any{}
    for rows.Next() {
      var id, name string
      var fee int
      var active bool
      if err := rows.Scan(&id, &name, &fee, &active); err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      out = append(out, map[string]any{"id": id, "name": name, "flat_fee": fee, "active": active})
    }
    writeJSON(w, http.StatusOK, out)
  }
}

func deliveryQuoteHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    var req DeliveryQuoteRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
      return
    }
    mode := strings.ToLower(strings.TrimSpace(req.Type))
    switch mode {
    case "zone":
      var fee int
      err := db.QueryRow(`SELECT flat_fee FROM delivery_zones WHERE id = $1 AND active = TRUE`, req.ZoneID).Scan(&fee)
      if err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("zone not found"))
        return
      }
      writeJSON(w, http.StatusOK, map[string]any{"fee": fee, "type": "zone"})
    case "per_km":
      var baseLat, baseLng float64
      var perKm, minFee int
      err := db.QueryRow(`SELECT base_lat, base_lng, per_km_rate, min_fee FROM delivery_settings WHERE id = 1`).Scan(&baseLat, &baseLng, &perKm, &minFee)
      if err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      dist := req.Distance
      if dist <= 0 && req.Lat != 0 && req.Lng != 0 {
        dist = haversineKm(baseLat, baseLng, req.Lat, req.Lng)
      }
      if dist <= 0 {
        writeJSON(w, http.StatusBadRequest, errMsg("distance_km or lat/lng required"))
        return
      }
      fee := int(math.Ceil(dist * float64(perKm)))
      if fee < minFee {
        fee = minFee
      }
      writeJSON(w, http.StatusOK, map[string]any{"fee": fee, "distance_km": dist, "type": "per_km"})
    case "external":
      fee, msg := externalShippingQuote(req)
      writeJSON(w, http.StatusOK, map[string]any{"fee": fee, "message": msg, "type": "external"})
    default:
      writeJSON(w, http.StatusBadRequest, errMsg("invalid type"))
    }
  }
}

func adminDeliveryZonesHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    switch r.Method {
    case http.MethodGet:
      if _, err := requireRoles(db, r, "owner", "admin", "staff"); err != nil {
        writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
        return
      }
      rows, err := db.Query(`SELECT id, name, flat_fee, active FROM delivery_zones ORDER BY name`)
      if err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      defer rows.Close()
      out := []map[string]any{}
      for rows.Next() {
        var id, name string
        var fee int
        var active bool
        if err := rows.Scan(&id, &name, &fee, &active); err != nil {
          writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
          return
        }
        out = append(out, map[string]any{"id": id, "name": name, "flat_fee": fee, "active": active})
      }
      writeJSON(w, http.StatusOK, out)
    case http.MethodPost:
      if _, err := requireRoles(db, r, "owner", "admin"); err != nil {
        writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
        return
      }
      var req DeliveryZoneRequest
      if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
        return
      }
      if req.Name == "" {
        writeJSON(w, http.StatusBadRequest, errMsg("name required"))
        return
      }
      if req.FlatFee < 0 {
        req.FlatFee = 0
      }
      active := req.Active
      _, err := db.Exec(`INSERT INTO delivery_zones (name, flat_fee, active) VALUES ($1,$2,$3)`, req.Name, req.FlatFee, active)
      if err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
    default:
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
    }
  }
}

func adminDeliverySettingsHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    switch r.Method {
    case http.MethodGet:
      if _, err := requireRoles(db, r, "owner", "admin", "staff"); err != nil {
        writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
        return
      }
      var baseLat, baseLng float64
      var perKm, minFee int
      err := db.QueryRow(`SELECT base_lat, base_lng, per_km_rate, min_fee FROM delivery_settings WHERE id = 1`).Scan(&baseLat, &baseLng, &perKm, &minFee)
      if err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      writeJSON(w, http.StatusOK, map[string]any{"base_lat": baseLat, "base_lng": baseLng, "per_km_rate": perKm, "min_fee": minFee})
    case http.MethodPut:
      if _, err := requireRoles(db, r, "owner", "admin"); err != nil {
        writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
        return
      }
      var req DeliverySettingsRequest
      if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
        return
      }
      _, err := db.Exec(`UPDATE delivery_settings SET base_lat = $1, base_lng = $2, per_km_rate = $3, min_fee = $4 WHERE id = 1`, req.BaseLat, req.BaseLng, req.PerKm, req.MinFee)
      if err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
    default:
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
    }
  }
}

func haversineKm(lat1, lon1, lat2, lon2 float64) float64 {
  const r = 6371.0
  dLat := (lat2 - lat1) * math.Pi / 180
  dLon := (lon2 - lon1) * math.Pi / 180
  a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*math.Sin(dLon/2)*math.Sin(dLon/2)
  c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
  return r * c
}

func externalShippingQuote(req DeliveryQuoteRequest) (int, string) {
  provider := strings.ToLower(strings.TrimSpace(os.Getenv("EXTERNAL_SHIPPING_PROVIDER")))
  if provider == "" {
    provider = "mock"
  }
  if provider == "mock" {
    if req.Distance > 0 {
      fee := int(math.Ceil(req.Distance * 4000))
      if fee < 10000 {
        fee = 10000
      }
      return fee, "mock provider"
    }
    return 15000, "mock provider"
  }
  if provider == "shipper" {
    if os.Getenv("SHIPPER_API_KEY") == "" || os.Getenv("SHIPPER_API_BASE_URL") == "" {
      return 0, "shipper not configured"
    }
    fee := 20000
    if req.Distance > 0 {
      fee = int(math.Ceil(req.Distance * 3500))
    }
    if fee < 12000 {
      fee = 12000
    }
    return fee, "shipper placeholder (configure API call)"
  }
  url := os.Getenv("EXTERNAL_SHIPPING_URL")
  key := os.Getenv("EXTERNAL_SHIPPING_KEY")
  if url == "" || key == "" {
    return 0, "external provider not configured"
  }
  return 20000, "external provider placeholder"
}
