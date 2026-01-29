package main

import (
  "database/sql"
  "errors"
  "regexp"
  "strings"
)

var usernamePattern = regexp.MustCompile(`^[a-z0-9_]{3,20}$`)

func validateUsername(username string) error {
  username = strings.ToLower(strings.TrimSpace(username))
  if !usernamePattern.MatchString(username) {
    return errors.New("username must be 3-20 chars: lowercase letters, numbers, underscore")
  }
  return nil
}

func generateUsernameFromEmail(db *sql.DB, email string) (string, error) {
  base := "user"
  if at := strings.Index(email, "@"); at > 0 {
    base = sanitizeUsername(strings.ToLower(email[:at]))
  }
  if base == "" {
    base = "user"
  }
  if len(base) < 3 {
    base = base + "123"
  }
  if len(base) > 16 {
    base = base[:16]
  }
  candidate := base
  for i := 0; i < 20; i++ {
    if i > 0 {
      candidate = base + randomSuffix(4)
    }
    if err := validateUsername(candidate); err != nil {
      continue
    }
    var exists int
    err := db.QueryRow(`SELECT 1 FROM users WHERE username = $1`, candidate).Scan(&exists)
    if err == sql.ErrNoRows {
      return candidate, nil
    }
    if err != nil {
      return "", err
    }
  }
  return "", errors.New("username unavailable")
}

func sanitizeUsername(v string) string {
  b := strings.Builder{}
  for _, r := range v {
    if r >= 'a' && r <= 'z' {
      b.WriteRune(r)
      continue
    }
    if r >= '0' && r <= '9' {
      b.WriteRune(r)
      continue
    }
    if r == '_' {
      b.WriteRune(r)
    }
  }
  return b.String()
}

func randomSuffix(n int) string {
  if n <= 0 {
    return ""
  }
  return generateToken()[:n]
}
