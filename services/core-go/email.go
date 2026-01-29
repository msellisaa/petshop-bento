package main

import (
  "fmt"
  "net/smtp"
  "os"
  "strconv"
  "strings"
)

func smtpConfig() (host string, port int, user string, pass string, from string) {
  host = strings.TrimSpace(os.Getenv("SMTP_HOST"))
  port = 587
  if v := strings.TrimSpace(os.Getenv("SMTP_PORT")); v != "" {
    if n, err := strconv.Atoi(v); err == nil && n > 0 {
      port = n
    }
  }
  user = strings.TrimSpace(os.Getenv("SMTP_USER"))
  pass = os.Getenv("SMTP_PASS")
  from = strings.TrimSpace(os.Getenv("SMTP_FROM"))
  return
}

func smtpEnabled() bool {
  host, _, user, pass, from := smtpConfig()
  return host != "" && user != "" && pass != "" && from != ""
}

func sendOtpEmail(to string, code string) error {
  host, port, user, pass, from := smtpConfig()
  if host == "" || user == "" || pass == "" || from == "" {
    return fmt.Errorf("smtp not configured")
  }
  auth := smtp.PlainAuth("", user, pass, host)
  subject := "Kode OTP Petshop Bento"
  body := fmt.Sprintf("Kode OTP kamu: %s\nBerlaku 5 menit.\n", code)
  msg := strings.Join([]string{
    "From: " + from,
    "To: " + to,
    "Subject: " + subject,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
  }, "\r\n")
  addr := fmt.Sprintf("%s:%d", host, port)
  return smtp.SendMail(addr, auth, from, []string{to}, []byte(msg))
}
