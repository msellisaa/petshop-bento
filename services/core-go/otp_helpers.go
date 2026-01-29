package main

import (
  "errors"
  "strings"
  "unicode"
)

func normalizePhone(v string) string {
  v = strings.TrimSpace(v)
  if v == "" {
    return ""
  }
  b := strings.Builder{}
  for _, r := range v {
    if unicode.IsDigit(r) {
      b.WriteRune(r)
    }
  }
  return b.String()
}

func otpDestination(email string, phone string, channel string) (string, string, error) {
  email = strings.ToLower(strings.TrimSpace(email))
  phone = normalizePhone(phone)
  channel = strings.ToLower(strings.TrimSpace(channel))
  if email != "" && phone != "" {
    return "", "", errors.New("use email or phone, not both")
  }
  if email == "" && phone == "" {
    return "", "", errors.New("email or phone required")
  }
  if email != "" {
    if channel == "" {
      channel = "email"
    }
    if channel != "email" {
      return "", "", errors.New("invalid channel for email")
    }
    return email, channel, nil
  }
  if channel == "" {
    channel = "whatsapp"
  }
  if channel != "whatsapp" {
    return "", "", errors.New("invalid channel for phone")
  }
  return phone, channel, nil
}
