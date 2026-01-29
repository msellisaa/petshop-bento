package main

import (
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
