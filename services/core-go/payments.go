package main

import (
  "bytes"
  "encoding/json"
  "io"
  "net/http"
  "os"
  "strings"
)

func midtransSnapProxyHandler() http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    var req MidtransSnapRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
      return
    }
    if req.OrderID == "" || req.GrossAmount <= 0 {
      writeJSON(w, http.StatusBadRequest, errMsg("order_id and gross_amount required"))
      return
    }
    target := bookingAPIURL() + "/payments/midtrans/snap"
    payload, _ := json.Marshal(req)
    resp, err := doBookingRequest(http.MethodPost, target, payload)
    if err != nil {
      writeJSON(w, http.StatusBadGateway, errMsg("booking service error"))
      return
    }
    defer resp.Body.Close()
    body, _ := io.ReadAll(resp.Body)
    if resp.StatusCode >= 400 {
      writeJSON(w, resp.StatusCode, errMsg("booking error"))
      return
    }
    var out map[string]any
    if err := json.Unmarshal(body, &out); err != nil {
      writeJSON(w, http.StatusBadGateway, errMsg("invalid booking response"))
      return
    }
    writeJSON(w, http.StatusOK, out)
  }
}

func midtransStatusProxyHandler() http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    orderID := strings.TrimPrefix(r.URL.Path, "/payments/midtrans/status/")
    if strings.TrimSpace(orderID) == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("missing order_id"))
      return
    }
    target := bookingAPIURL() + "/payments/midtrans/status/" + orderID
    resp, err := doBookingRequest(http.MethodGet, target, nil)
    if err != nil {
      writeJSON(w, http.StatusBadGateway, errMsg("booking service error"))
      return
    }
    defer resp.Body.Close()
    body, _ := io.ReadAll(resp.Body)
    if resp.StatusCode >= 400 {
      writeJSON(w, resp.StatusCode, errMsg("booking error"))
      return
    }
    var out map[string]any
    if err := json.Unmarshal(body, &out); err != nil {
      writeJSON(w, http.StatusBadGateway, errMsg("invalid booking response"))
      return
    }
    writeJSON(w, http.StatusOK, out)
  }
}

func bookingAPIURL() string {
  url := strings.TrimSpace(os.Getenv("BOOKING_API_URL"))
  if url == "" {
    url = "http://localhost:8082"
  }
  return strings.TrimRight(url, "/")
}

func doBookingRequest(method, url string, body []byte) (*http.Response, error) {
  var reader io.Reader
  if body != nil {
    reader = bytes.NewReader(body)
  }
  req, err := http.NewRequest(method, url, reader)
  if err != nil {
    return nil, err
  }
  req.Header.Set("Content-Type", "application/json")
  if secret := strings.TrimSpace(os.Getenv("BOOKING_ADMIN_SECRET")); secret != "" {
    req.Header.Set("X-Admin-Secret", secret)
  }
  return http.DefaultClient.Do(req)
}
