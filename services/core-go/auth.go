package main

import (
  "crypto/rand"
  "database/sql"
  "encoding/base64"
  "encoding/json"
  "fmt"
  "net/http"
  "os"
  "strings"
  "time"

  "golang.org/x/crypto/bcrypt"
)

type TierInfo struct {
  Name         string
  DiscountPct  int
  CashbackPct  int
}

func registerHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    var req AuthRegisterRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
      return
    }
    if req.Name == "" || req.Email == "" || req.Phone == "" || req.Password == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("name, email, phone, password required"))
      return
    }
    if req.OtpToken == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("otp_token required"))
      return
    }

    if ok := consumeOtpToken(db, strings.ToLower(req.Email), "register", req.OtpToken); !ok {
      writeJSON(w, http.StatusUnauthorized, errMsg("invalid otp"))
      return
    }

    hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("hash failed"))
      return
    }

    var userID string
    err = db.QueryRow(`INSERT INTO users (name, email, phone, password_hash, auth_provider) VALUES ($1,$2,$3,$4,'password') RETURNING id`,
      req.Name, strings.ToLower(req.Email), req.Phone, string(hash)).Scan(&userID)
    if err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("email already used"))
      return
    }
    _, _ = db.Exec(`INSERT INTO user_vouchers (user_id, code) VALUES ($1,$2)`, userID, "WELCOME50")
    writeJSON(w, http.StatusOK, map[string]string{"user_id": userID})
  }
}

func loginHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    var req AuthLoginRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
      return
    }
    var id, hash, name, phone, tier, role string
    var isAdmin bool
    var totalSpend, wallet int
    err := db.QueryRow(`SELECT id, password_hash, name, phone, tier, total_spend, wallet_balance, is_admin, role FROM users WHERE email = $1`, strings.ToLower(req.Email)).
      Scan(&id, &hash, &name, &phone, &tier, &totalSpend, &wallet, &isAdmin, &role)
    if err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("invalid credentials"))
      return
    }
    if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("invalid credentials"))
      return
    }

    token := generateToken()
    _, err = db.Exec(`INSERT INTO sessions (token, user_id) VALUES ($1,$2)`, token, id)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("login failed"))
      return
    }

    writeJSON(w, http.StatusOK, map[string]any{
      "token": token,
      "user": map[string]any{
        "id": id,
        "name": name,
        "email": strings.ToLower(req.Email),
        "phone": phone,
        "tier": tier,
        "total_spend": totalSpend,
        "wallet_balance": wallet,
        "is_admin": isAdmin,
        "role": role,
      },
    })
  }
}

func otpRequestHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    var req OtpRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
      return
    }
    email := strings.ToLower(strings.TrimSpace(req.Email))
    purpose := strings.ToLower(strings.TrimSpace(req.Purpose))
    if email == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("email required"))
      return
    }
    if purpose == "" {
      purpose = "register"
    }
    if purpose != "register" {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid purpose"))
      return
    }

    code := generateOTPCode()
    expiresAt := time.Now().Add(5 * time.Minute)
    _, err := db.Exec(`INSERT INTO otp_requests (email, purpose, code, expires_at) VALUES ($1,$2,$3,$4)`,
      email, purpose, code, expiresAt)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("otp request failed"))
      return
    }

    echo := strings.ToLower(strings.TrimSpace(os.Getenv("OTP_ECHO")))
    if echo == "" || echo == "true" || echo == "1" || echo == "yes" {
      writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "otp": code, "expires_in": 300})
      return
    }
    writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
  }
}

func otpVerifyHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    var req OtpVerifyRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
      return
    }
    email := strings.ToLower(strings.TrimSpace(req.Email))
    purpose := strings.ToLower(strings.TrimSpace(req.Purpose))
    code := strings.TrimSpace(req.Code)
    if email == "" || code == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("email and code required"))
      return
    }
    if purpose == "" {
      purpose = "register"
    }
    if purpose != "register" {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid purpose"))
      return
    }

    var reqID string
    err := db.QueryRow(`SELECT id FROM otp_requests WHERE email = $1 AND purpose = $2 AND code = $3 AND verified_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
      email, purpose, code).Scan(&reqID)
    if err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("invalid otp"))
      return
    }
    _, _ = db.Exec(`UPDATE otp_requests SET verified_at = NOW() WHERE id = $1`, reqID)

    token := generateToken()
    _, err = db.Exec(`INSERT INTO otp_tokens (token, email, purpose, expires_at) VALUES ($1,$2,$3,$4)`,
      token, email, purpose, time.Now().Add(10*time.Minute))
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("otp verify failed"))
      return
    }
    writeJSON(w, http.StatusOK, map[string]any{"otp_token": token})
  }
}

func googleLoginHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    var req GoogleLoginRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
      return
    }
    email := strings.ToLower(strings.TrimSpace(req.Email))
    name := strings.TrimSpace(req.Name)
    phone := strings.TrimSpace(req.Phone)
    googleID := strings.TrimSpace(req.GoogleID)
    if email == "" || googleID == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("email and google_id required"))
      return
    }

    var id, dbName, dbEmail, dbPhone, tier, role string
    var isAdmin bool
    var totalSpend, wallet int
    err := db.QueryRow(`SELECT id, name, email, phone, tier, total_spend, wallet_balance, is_admin, role FROM users WHERE email = $1 OR google_id = $2`,
      email, googleID).Scan(&id, &dbName, &dbEmail, &dbPhone, &tier, &totalSpend, &wallet, &isAdmin, &role)
    if err == sql.ErrNoRows {
      if name == "" || phone == "" {
        writeJSON(w, http.StatusBadRequest, errMsg("name and phone required for registration"))
        return
      }
      tempPass := generateToken()
      hash, err := bcrypt.GenerateFromPassword([]byte(tempPass), bcrypt.DefaultCost)
      if err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg("hash failed"))
        return
      }
      err = db.QueryRow(`INSERT INTO users (name, email, phone, password_hash, google_id, auth_provider) VALUES ($1,$2,$3,$4,$5,'google') RETURNING id`,
        name, email, phone, string(hash), googleID).Scan(&id)
      if err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("create user failed"))
        return
      }
      dbName = name
      dbEmail = email
      dbPhone = phone
      tier = "Bronze"
      totalSpend = 0
      wallet = 0
      isAdmin = false
      role = "member"
      _, _ = db.Exec(`INSERT INTO user_vouchers (user_id, code) VALUES ($1,$2)`, id, "WELCOME50")
    } else if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("login failed"))
      return
    }

    token := generateToken()
    _, err = db.Exec(`INSERT INTO sessions (token, user_id) VALUES ($1,$2)`, token, id)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("login failed"))
      return
    }

    writeJSON(w, http.StatusOK, map[string]any{
      "token": token,
      "user": map[string]any{
        "id": id,
        "name": dbName,
        "email": dbEmail,
        "phone": dbPhone,
        "tier": tier,
        "total_spend": totalSpend,
        "wallet_balance": wallet,
        "is_admin": isAdmin,
        "role": role,
      },
    })
  }
}

func adminLoginHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    var req AuthLoginRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
      return
    }
    var id, hash, name, email, role string
    var isAdmin bool
    err := db.QueryRow(`SELECT id, password_hash, name, email, is_admin, role FROM users WHERE email = $1`, strings.ToLower(req.Email)).
      Scan(&id, &hash, &name, &email, &isAdmin, &role)
    if err != nil || !isAdmin {
      writeJSON(w, http.StatusUnauthorized, errMsg("invalid credentials"))
      return
    }
    if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("invalid credentials"))
      return
    }

    token := generateToken()
    _, err = db.Exec(`INSERT INTO sessions (token, user_id) VALUES ($1,$2)`, token, id)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("login failed"))
      return
    }
    writeJSON(w, http.StatusOK, map[string]any{
      "token": token,
      "admin": map[string]any{
        "id": id,
        "name": name,
        "email": email,
        "role": role,
      },
    })
  }
}

func adminBootstrapHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    secret := os.Getenv("ADMIN_BOOTSTRAP_SECRET")
    if secret == "" {
      writeJSON(w, http.StatusForbidden, errMsg("admin bootstrap disabled"))
      return
    }
    var req AdminBootstrapRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
      return
    }
    if req.Secret != secret {
      writeJSON(w, http.StatusForbidden, errMsg("invalid secret"))
      return
    }
    var count int
    _ = db.QueryRow(`SELECT COUNT(*) FROM users WHERE is_admin = TRUE`).Scan(&count)
    if count > 0 {
      writeJSON(w, http.StatusBadRequest, errMsg("admin already exists"))
      return
    }
    if req.Name == "" || req.Email == "" || req.Phone == "" || req.Password == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("name, email, phone, password required"))
      return
    }
    hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("hash failed"))
      return
    }
    var userID string
    err = db.QueryRow(`INSERT INTO users (name, email, phone, password_hash, is_admin, role) VALUES ($1,$2,$3,$4,TRUE,'owner') RETURNING id`,
      req.Name, strings.ToLower(req.Email), req.Phone, string(hash)).Scan(&userID)
    if err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("admin create failed"))
      return
    }
    writeJSON(w, http.StatusOK, map[string]string{"admin_id": userID})
  }
}

func meHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    userID, err := getUserIDFromToken(db, r)
    if err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
      return
    }
    var name, email, phone, tier string
    var totalSpend, wallet int
    err = db.QueryRow(`SELECT name, email, phone, tier, total_spend, wallet_balance FROM users WHERE id = $1`, userID).
      Scan(&name, &email, &phone, &tier, &totalSpend, &wallet)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("not found"))
      return
    }
    writeJSON(w, http.StatusOK, map[string]any{
      "id": userID,
      "name": name,
      "email": email,
      "phone": phone,
      "tier": tier,
      "total_spend": totalSpend,
      "wallet_balance": wallet,
    })
  }
}

func meOrdersHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    userID, err := getUserIDFromToken(db, r)
    if err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
      return
    }
    rows, err := db.Query(`SELECT id, subtotal, discount, cashback, wallet_used, total, status, created_at FROM orders WHERE user_id = $1 ORDER BY created_at DESC`, userID)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
      return
    }
    defer rows.Close()
    out := []map[string]any{}
    for rows.Next() {
      var id, status, createdAt string
      var subtotal, discount, cashback, walletUsed, total int
      if err := rows.Scan(&id, &subtotal, &discount, &cashback, &walletUsed, &total, &status, &createdAt); err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      out = append(out, map[string]any{
        "id": id,
        "subtotal": subtotal,
        "discount": discount,
        "cashback": cashback,
        "wallet_used": walletUsed,
        "total": total,
        "status": status,
        "created_at": createdAt,
      })
    }
    writeJSON(w, http.StatusOK, out)
  }
}

func meVouchersHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    userID, err := getUserIDFromToken(db, r)
    if err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
      return
    }
    rows, err := db.Query(`SELECT uv.code, uv.used, v.title, v.discount_type, v.discount_value, v.min_spend, v.expires_at FROM user_vouchers uv JOIN vouchers v ON uv.code = v.code WHERE uv.user_id = $1`, userID)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
      return
    }
    defer rows.Close()

    out := []map[string]any{}
    for rows.Next() {
      var code, title, dtype string
      var used bool
      var dval, minSpend int
      var expiresAt sql.NullString
      if err := rows.Scan(&code, &used, &title, &dtype, &dval, &minSpend, &expiresAt); err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      out = append(out, map[string]any{
        "code": code,
        "used": used,
        "title": title,
        "discount_type": dtype,
        "discount_value": dval,
        "min_spend": minSpend,
        "expires_at": expiresAt.String,
      })
    }
    writeJSON(w, http.StatusOK, out)
  }
}

func membersHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    if _, err := requireRoles(db, r, "owner", "admin", "staff"); err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
      return
    }
    rows, err := db.Query(`SELECT id, name, email, phone, tier, total_spend, wallet_balance, created_at FROM users ORDER BY total_spend DESC`)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
      return
    }
    defer rows.Close()

    out := []map[string]any{}
    for rows.Next() {
      var id, name, email, phone, tier, createdAt string
      var totalSpend, wallet int
      if err := rows.Scan(&id, &name, &email, &phone, &tier, &totalSpend, &wallet, &createdAt); err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      out = append(out, map[string]any{
        "id": id,
        "name": name,
        "email": email,
        "phone": phone,
        "tier": tier,
        "total_spend": totalSpend,
        "wallet_balance": wallet,
        "created_at": createdAt,
      })
    }
    writeJSON(w, http.StatusOK, out)
  }
}

func vouchersHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    rows, err := db.Query(`SELECT code, title, discount_type, discount_value, min_spend, max_uses, uses, expires_at, active FROM vouchers WHERE active = TRUE`)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
      return
    }
    defer rows.Close()

    out := []map[string]any{}
    for rows.Next() {
      var code, title, dtype string
      var minSpend, maxUses, uses, dval int
      var expiresAt sql.NullString
      var active bool
      if err := rows.Scan(&code, &title, &dtype, &dval, &minSpend, &maxUses, &uses, &expiresAt, &active); err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      out = append(out, map[string]any{
        "code": code,
        "title": title,
        "discount_type": dtype,
        "discount_value": dval,
        "min_spend": minSpend,
        "max_uses": maxUses,
        "uses": uses,
        "expires_at": expiresAt.String,
        "active": active,
      })
    }
    writeJSON(w, http.StatusOK, out)
  }
}

func adminVouchersHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    switch r.Method {
    case http.MethodGet:
      if _, err := requireRoles(db, r, "owner", "admin", "staff"); err != nil {
        writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
        return
      }
      vouchersHandler(db)(w, r)
    case http.MethodPost:
      if _, err := requireRoles(db, r, "owner", "admin"); err != nil {
        writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
        return
      }
      var req VoucherCreateRequest
      if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
        return
      }
      if req.Code == "" || req.Title == "" || req.DiscountType == "" || req.DiscountValue <= 0 {
        writeJSON(w, http.StatusBadRequest, errMsg("code, title, discount_type, discount_value required"))
        return
      }
      _, err := db.Exec(`INSERT INTO vouchers (code, title, discount_type, discount_value, min_spend, max_uses, expires_at, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)` ,
        strings.ToUpper(req.Code), req.Title, req.DiscountType, req.DiscountValue, req.MinSpend, req.MaxUses, nullIfEmpty(req.ExpiresAt), req.Active)
      if err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("create voucher failed"))
        return
      }
      writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
    default:
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
    }
  }
}

func adminOrdersHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    if _, err := requireRoles(db, r, "owner", "admin", "staff"); err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
      return
    }
    rows, err := db.Query(`SELECT o.id, o.customer_name, o.phone, o.total, o.status, o.voucher_code, o.created_at, u.name, u.tier FROM orders o LEFT JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC`)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
      return
    }
    defer rows.Close()

    out := []map[string]any{}
    for rows.Next() {
      var id, cname, phone, status, createdAt string
      var voucher sql.NullString
      var total int
      var userName, tier sql.NullString
      if err := rows.Scan(&id, &cname, &phone, &total, &status, &voucher, &createdAt, &userName, &tier); err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      out = append(out, map[string]any{
        "id": id,
        "customer_name": cname,
        "phone": phone,
        "total": total,
        "status": status,
        "voucher_code": voucher.String,
        "created_at": createdAt,
        "member_name": userName.String,
        "member_tier": tier.String,
      })
    }
    writeJSON(w, http.StatusOK, out)
  }
}

func getUserIDFromToken(db *sql.DB, r *http.Request) (string, error) {
  token := r.Header.Get("X-Auth-Token")
  if token == "" {
    return "", sql.ErrNoRows
  }
  var userID string
  err := db.QueryRow(`SELECT user_id FROM sessions WHERE token = $1`, token).Scan(&userID)
  return userID, err
}

func requireRoles(db *sql.DB, r *http.Request, roles ...string) (string, error) {
  userID, err := getUserIDFromToken(db, r)
  if err != nil {
    return "", err
  }
  var isAdmin bool
  var role string
  err = db.QueryRow(`SELECT is_admin, role FROM users WHERE id = $1`, userID).Scan(&isAdmin, &role)
  if err != nil || !isAdmin {
    return "", sql.ErrNoRows
  }
  for _, r := range roles {
    if strings.EqualFold(role, r) {
      return userID, nil
    }
  }
  if len(roles) == 0 {
    return userID, nil
  }
  return "", sql.ErrNoRows
}

func adminStaffHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    switch r.Method {
    case http.MethodGet:
      if _, err := requireRoles(db, r, "owner", "admin"); err != nil {
        writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
        return
      }
      rows, err := db.Query(`SELECT id, name, email, phone, role, created_at FROM users WHERE is_admin = TRUE ORDER BY created_at DESC`)
      if err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      defer rows.Close()
      out := []map[string]any{}
      for rows.Next() {
        var id, name, email, phone, role, createdAt string
        if err := rows.Scan(&id, &name, &email, &phone, &role, &createdAt); err != nil {
          writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
          return
        }
        out = append(out, map[string]any{
          "id": id,
          "name": name,
          "email": email,
          "phone": phone,
          "role": role,
          "created_at": createdAt,
        })
      }
      writeJSON(w, http.StatusOK, out)
    case http.MethodPost:
      if _, err := requireRoles(db, r, "owner", "admin"); err != nil {
        writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
        return
      }
      var req AdminUserCreateRequest
      if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
        return
      }
      role := strings.ToLower(strings.TrimSpace(req.Role))
      if role == "" {
        role = "staff"
      }
      if req.Name == "" || req.Email == "" || req.Phone == "" || req.Password == "" {
        writeJSON(w, http.StatusBadRequest, errMsg("name, email, phone, password required"))
        return
      }
      hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
      if err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg("hash failed"))
        return
      }
      var userID string
      err = db.QueryRow(`INSERT INTO users (name, email, phone, password_hash, is_admin, role) VALUES ($1,$2,$3,$4,TRUE,$5) RETURNING id`,
        req.Name, strings.ToLower(req.Email), req.Phone, string(hash), role).Scan(&userID)
      if err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("create staff failed"))
        return
      }
      writeJSON(w, http.StatusOK, map[string]string{"staff_id": userID})
    default:
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
    }
  }
}

func adminOrderStatusHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPut {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    if _, err := requireRoles(db, r, "owner", "admin"); err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
      return
    }
    id := strings.TrimPrefix(r.URL.Path, "/admin/orders/")
    id = strings.TrimSuffix(id, "/status")
    if id == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("missing id"))
      return
    }
    var req OrderStatusRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
      return
    }
    if req.Status == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("status required"))
      return
    }
    _, err := db.Exec(`UPDATE orders SET status = $1 WHERE id = $2`, strings.ToUpper(req.Status), id)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
      return
    }
    writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
  }
}

func midtransWebhookHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    secret := os.Getenv("CORE_WEBHOOK_SECRET")
    if secret == "" || r.Header.Get("X-Service-Secret") != secret {
      writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
      return
    }
    var payload map[string]any
    if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
      return
    }
    orderID, _ := payload["order_id"].(string)
    status, _ := payload["transaction_status"].(string)
    if orderID == "" || status == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("order_id and transaction_status required"))
      return
    }
    mapped := mapMidtransStatus(status)
    _, err := db.Exec(`UPDATE orders SET status = $1 WHERE id = $2`, mapped, orderID)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
      return
    }
    writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
  }
}

func mapMidtransStatus(status string) string {
  switch strings.ToLower(status) {
  case "settlement", "capture":
    return "PAID"
  case "pending":
    return "PENDING"
  case "expire", "cancel", "deny":
    return "FAILED"
  default:
    return strings.ToUpper(status)
  }
}

func generateOTPCode() string {
  b := make([]byte, 3)
  _, _ = rand.Read(b)
  n := int(b[0])<<16 + int(b[1])<<8 + int(b[2])
  return fmt.Sprintf("%06d", n%1000000)
}

func consumeOtpToken(db *sql.DB, email string, purpose string, token string) bool {
  email = strings.ToLower(strings.TrimSpace(email))
  purpose = strings.ToLower(strings.TrimSpace(purpose))
  token = strings.TrimSpace(token)
  if email == "" || purpose == "" || token == "" {
    return false
  }
  var used bool
  err := db.QueryRow(`SELECT used FROM otp_tokens WHERE token = $1 AND email = $2 AND purpose = $3 AND expires_at > NOW()`,
    token, email, purpose).Scan(&used)
  if err != nil || used {
    return false
  }
  _, err = db.Exec(`UPDATE otp_tokens SET used = TRUE WHERE token = $1`, token)
  return err == nil
}

func getTierInfo(db *sql.DB, totalSpend int) (TierInfo, error) {
  var t TierInfo
  err := db.QueryRow(`SELECT name, discount_pct, cashback_pct FROM loyalty_tiers WHERE min_spend <= $1 ORDER BY min_spend DESC LIMIT 1`, totalSpend).
    Scan(&t.Name, &t.DiscountPct, &t.CashbackPct)
  return t, err
}

func generateToken() string {
  b := make([]byte, 32)
  _, _ = rand.Read(b)
  return base64.RawURLEncoding.EncodeToString(b)
}

func nullIfEmpty(v string) any {
  if strings.TrimSpace(v) == "" {
    return nil
  }
  return v
}

func rewardCodeForTier(tier string) string {
  switch strings.ToLower(tier) {
  case "silver":
    return "SILVER100"
  case "gold":
    return "GOLD200"
  case "platinum":
    return "PLAT300"
  default:
    return ""
  }
}

func applyVoucher(db *sql.DB, code string, subtotal int, userID string) (int, error) {
  if strings.TrimSpace(code) == "" {
    return 0, nil
  }
  var vType string
  var vVal, minSpend, maxUses, uses int
  var active bool
  var expiresAt sql.NullString
  err := db.QueryRow(`SELECT discount_type, discount_value, min_spend, max_uses, uses, expires_at, active FROM vouchers WHERE code = $1`, strings.ToUpper(code)).
    Scan(&vType, &vVal, &minSpend, &maxUses, &uses, &expiresAt, &active)
  if err != nil {
    if err == sql.ErrNoRows {
      return 0, errInvalid("voucher not found")
    }
    return 0, err
  }
  if !active {
    return 0, errInvalid("voucher not active")
  }
  if expiresAt.Valid {
    var ok int
    err := db.QueryRow(`SELECT CASE WHEN $1::date >= CURRENT_DATE THEN 1 ELSE 0 END`, expiresAt.String).Scan(&ok)
    if err != nil || ok == 0 {
      return 0, errInvalid("voucher expired")
    }
  }
  if subtotal < minSpend {
    return 0, errInvalid("min spend not met")
  }
  if maxUses > 0 && uses >= maxUses {
    return 0, errInvalid("voucher quota used")
  }

  if userID != "" {
    var used bool
    err := db.QueryRow(`SELECT used FROM user_vouchers WHERE user_id = $1 AND code = $2`, userID, strings.ToUpper(code)).Scan(&used)
    if err == nil && used {
      return 0, errInvalid("voucher already used")
    }
  }

  discount := 0
  if strings.ToLower(vType) == "percent" {
    discount = subtotal * vVal / 100
  } else {
    discount = vVal
  }
  if discount < 0 {
    discount = 0
  }
  if discount > subtotal {
    discount = subtotal
  }

  _, _ = db.Exec(`UPDATE vouchers SET uses = uses + 1 WHERE code = $1`, strings.ToUpper(code))

  if userID != "" {
    _, _ = db.Exec(`UPDATE user_vouchers SET used = TRUE WHERE user_id = $1 AND code = $2`, userID, strings.ToUpper(code))
  }

  return discount, nil
}
