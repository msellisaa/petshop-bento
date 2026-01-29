package main

import (
  "crypto/rand"
  "encoding/hex"
  "encoding/json"
  "net/http"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
  w.Header().Set("Content-Type", "application/json")
  w.WriteHeader(status)
  _ = json.NewEncoder(w).Encode(v)
}

func errMsg(msg string) map[string]string {
  return map[string]string{"error": msg}
}

type appError struct {
  msg string
}

func (e appError) Error() string {
  return e.msg
}

func errInvalid(msg string) error {
  return appError{msg: msg}
}

func isInvalid(err error) bool {
  _, ok := err.(appError)
  return ok
}

func randToken(n int) (string, error) {
  buf := make([]byte, n)
  if _, err := rand.Read(buf); err != nil {
    return "", err
  }
  return hex.EncodeToString(buf), nil
}
