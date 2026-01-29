package main

import (
  "bytes"
  "errors"
  "mime/multipart"
  "net/http"
  "os"
  "strings"
  "time"
)

var errOtpDeliveryNotConfigured = errors.New("otp delivery not configured")

func isOtpDeliveryNotConfigured(err error) bool {
  return errors.Is(err, errOtpDeliveryNotConfigured)
}

func deliverOtp(channel string, destination string, code string) error {
  switch strings.ToLower(strings.TrimSpace(channel)) {
  case "email":
    if !smtpEnabled() {
      return errOtpDeliveryNotConfigured
    }
    return sendOtpEmail(destination, code)
  case "whatsapp":
    if !fonnteEnabled() {
      return errOtpDeliveryNotConfigured
    }
    return sendOtpWhatsApp(destination, code)
  case "sms":
    if !smsEnabled() {
      return errOtpDeliveryNotConfigured
    }
    return sendOtpSMS(destination, code)
  default:
    return errors.New("invalid channel")
  }
}

func fonnteEnabled() bool {
  return strings.TrimSpace(os.Getenv("FONNTE_API_KEY")) != ""
}

func sendOtpWhatsApp(phone string, code string) error {
  baseURL := strings.TrimSpace(os.Getenv("FONNTE_BASE_URL"))
  if baseURL == "" {
    baseURL = "https://api.fonnte.com/send"
  }
  apiKey := strings.TrimSpace(os.Getenv("FONNTE_API_KEY"))
  if apiKey == "" {
    return errOtpDeliveryNotConfigured
  }
  message := "Kode OTP kamu: " + code + ". Berlaku 5 menit."
  body := &bytes.Buffer{}
  writer := multipart.NewWriter(body)
  _ = writer.WriteField("target", phone)
  _ = writer.WriteField("message", message)
  if cc := strings.TrimSpace(os.Getenv("FONNTE_COUNTRY_CODE")); cc != "" {
    _ = writer.WriteField("countryCode", cc)
  }
  _ = writer.Close()

  req, err := http.NewRequest(http.MethodPost, baseURL, body)
  if err != nil {
    return err
  }
  req.Header.Set("Authorization", apiKey)
  req.Header.Set("Content-Type", writer.FormDataContentType())

  client := &http.Client{Timeout: 10 * time.Second}
  resp, err := client.Do(req)
  if err != nil {
    return err
  }
  defer resp.Body.Close()
  if resp.StatusCode >= 400 {
    return errors.New("whatsapp delivery failed")
  }
  return nil
}

func smsEnabled() bool {
  return false
}

func sendOtpSMS(phone string, code string) error {
  return errOtpDeliveryNotConfigured
}
