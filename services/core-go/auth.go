package main

import (
  "crypto/rand"
  "database/sql"
  "encoding/base64"
  "encoding/json"
  "fmt"
  "io"
  "net/http"
  "net/url"
  "os"
  "strconv"
  "strings"
  "time"

  "golang.org/x/crypto/bcrypt"
)

type TierInfo struct {
  Name         string
  DiscountPct  int
  CashbackPct  int
}

type googleTokenInfo struct {
  Email         string `json:"email"`
  EmailVerified string `json:"email_verified"`
  Name          string `json:"name"`
  Sub           string `json:"sub"`
  Aud           string `json:"aud"`
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
    email := strings.ToLower(strings.TrimSpace(req.Email))
    username := strings.ToLower(strings.TrimSpace(req.Username))
    phone := normalizePhone(req.Phone)
    if req.Name == "" || username == "" || req.Password == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("name, username, password required"))
      return
    }
    if email == "" && phone == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("email or phone required"))
      return
    }
    if err := validateUsername(username); err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg(err.Error()))
      return
    }
    if strings.TrimSpace(req.OtpToken) == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("otp_token required"))
      return
    }
    dest, channel, derr := otpDestination(email, phone, req.OtpChannel)
    if derr != nil {
      writeJSON(w, http.StatusBadRequest, errMsg(derr.Error()))
      return
    }
    if ok := consumeOtpToken(db, dest, channel, "register", req.OtpToken); !ok {
      writeJSON(w, http.StatusUnauthorized, errMsg("invalid otp"))
      return
    }
    hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("hash failed"))
      return
    }

    var userID string
    avatar := strings.TrimSpace(req.AvatarURL)
    emailVerified := channel == "email"
    phoneVerified := channel == "whatsapp" || channel == "sms"
    err = db.QueryRow(
      `INSERT INTO users (name, username, email, phone, password_hash, auth_provider, avatar_url, email_verified_at, phone_verified_at)
       VALUES ($1,$2,$3,$4,$5,'password',$6,CASE WHEN $7 THEN NOW() ELSE NULL END,CASE WHEN $8 THEN NOW() ELSE NULL END)
       RETURNING id`,
      req.Name, username, nullIfEmpty(email), nullIfEmpty(phone), string(hash), nullIfEmpty(avatar), emailVerified, phoneVerified,
    ).Scan(&userID)
    if err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("username or email already used"))
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
    identifier := strings.TrimSpace(req.Email)
    if identifier == "" || strings.TrimSpace(req.Password) == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("identifier and password required"))
      return
    }
    email := strings.ToLower(identifier)
    phone := normalizePhone(identifier)
    var id, hash, name, tier, role, username string
    var dbPhone, dbEmail, avatar sql.NullString
    var isAdmin bool
    var totalSpend, wallet int
    err := db.QueryRow(`SELECT id, password_hash, name, phone, tier, total_spend, wallet_balance, is_admin, role, email, username, avatar_url FROM users WHERE email = $1 OR phone = $2`,
      email, phone).
      Scan(&id, &hash, &name, &dbPhone, &tier, &totalSpend, &wallet, &isAdmin, &role, &dbEmail, &username, &avatar)
    if err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("invalid credentials"))
      return
    }
    if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password)); err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("invalid credentials"))
      return
    }

    token := generateToken()
    _, err = db.Exec(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,$3)`, token, id, sessionExpiry())
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("login failed"))
      return
    }

    writeJSON(w, http.StatusOK, map[string]any{
      "token": token,
      "user": map[string]any{
        "id": id,
        "name": name,
        "email": dbEmail.String,
        "phone": dbPhone.String,
        "username": username,
        "avatar_url": avatar.String,
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
    phone := normalizePhone(req.Phone)
    purpose := strings.ToLower(strings.TrimSpace(req.Purpose))
    if purpose == "" {
      purpose = "register"
    }
    if purpose != "register" {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid purpose"))
      return
    }
    dest, channel, derr := otpDestination(email, phone, req.Channel)
    if derr != nil {
      writeJSON(w, http.StatusBadRequest, errMsg(derr.Error()))
      return
    }

    code := generateOTPCode()
    expiresAt := time.Now().Add(5 * time.Minute)
    _, err := db.Exec(`INSERT INTO otp_requests (destination, channel, purpose, code, expires_at) VALUES ($1,$2,$3,$4,$5)`,
      dest, channel, purpose, code, expiresAt)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("otp request failed"))
      return
    }

    if err := deliverOtp(channel, dest, code); err == nil {
      writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
      return
    } else if !isOtpDeliveryNotConfigured(err) {
      writeJSON(w, http.StatusInternalServerError, errMsg("otp delivery failed"))
      return
    }

    echo := strings.ToLower(strings.TrimSpace(os.Getenv("OTP_ECHO")))
    if echo == "" || echo == "true" || echo == "1" || echo == "yes" {
      writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "otp": code, "expires_in": 300})
      return
    }
    writeJSON(w, http.StatusInternalServerError, errMsg("otp delivery not configured"))
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
    phone := normalizePhone(req.Phone)
    purpose := strings.ToLower(strings.TrimSpace(req.Purpose))
    code := strings.TrimSpace(req.Code)
    if purpose == "" {
      purpose = "register"
    }
    if purpose != "register" {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid purpose"))
      return
    }
    dest, channel, derr := otpDestination(email, phone, req.Channel)
    if derr != nil {
      writeJSON(w, http.StatusBadRequest, errMsg(derr.Error()))
      return
    }
    if code == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("code required"))
      return
    }

    var reqID string
    err := db.QueryRow(`SELECT id FROM otp_requests WHERE destination = $1 AND channel = $2 AND purpose = $3 AND code = $4 AND verified_at IS NULL AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1`,
      dest, channel, purpose, code).Scan(&reqID)
    if err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("invalid otp"))
      return
    }
    _, _ = db.Exec(`UPDATE otp_requests SET verified_at = NOW() WHERE id = $1`, reqID)

    token := generateToken()
    _, err = db.Exec(`INSERT INTO otp_tokens (token, destination, channel, purpose, expires_at) VALUES ($1,$2,$3,$4,$5)`,
      token, dest, channel, purpose, time.Now().Add(10*time.Minute))
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
    if strings.TrimSpace(req.IDToken) == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("id_token required"))
      return
    }
    info, err := verifyGoogleIDToken(req.IDToken)
    if err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("invalid google token"))
      return
    }
    email := strings.ToLower(strings.TrimSpace(info.Email))
    name := strings.TrimSpace(info.Name)
    phone := normalizePhone(req.Phone)
    googleID := strings.TrimSpace(info.Sub)
    if email == "" || googleID == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("google token missing email"))
      return
    }

    var id, dbName, dbEmail, tier, role, username string
    var dbPhone, avatar sql.NullString
    var isAdmin bool
    var totalSpend, wallet int
    err := db.QueryRow(`SELECT id, name, email, phone, tier, total_spend, wallet_balance, is_admin, role, username, avatar_url FROM users WHERE email = $1 OR google_id = $2`,
      email, googleID).Scan(&id, &dbName, &dbEmail, &dbPhone, &tier, &totalSpend, &wallet, &isAdmin, &role, &username, &avatar)
    if err == sql.ErrNoRows {
      if name == "" {
        writeJSON(w, http.StatusBadRequest, errMsg("name required for registration"))
        return
      }
      username, err := generateUsernameFromEmail(db, email)
      if err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg("username generate failed"))
        return
      }
      tempPass := generateToken()
      hash, err := bcrypt.GenerateFromPassword([]byte(tempPass), bcrypt.DefaultCost)
      if err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg("hash failed"))
        return
      }
      err = db.QueryRow(`INSERT INTO users (name, username, email, phone, password_hash, google_id, auth_provider, email_verified_at) VALUES ($1,$2,$3,$4,$5,$6,'google',NOW()) RETURNING id`,
        name, username, email, nullIfEmpty(phone), string(hash), googleID).Scan(&id)
      if err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("create user failed"))
        return
      }
      dbName = name
      dbEmail = email
      dbPhone = sql.NullString{String: phone, Valid: phone != ""}
      avatar = sql.NullString{}
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
    _, err = db.Exec(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,$3)`, token, id, sessionExpiry())
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
        "phone": dbPhone.String,
        "username": username,
        "avatar_url": avatar.String,
        "tier": tier,
        "total_spend": totalSpend,
        "wallet_balance": wallet,
        "is_admin": isAdmin,
        "role": role,
      },
    })
  }
}

func verifyGoogleIDToken(idToken string) (*googleTokenInfo, error) {
  clientID := strings.TrimSpace(os.Getenv("GOOGLE_CLIENT_ID"))
  if clientID == "" {
    return nil, fmt.Errorf("google client id not configured")
  }
  endpoint := "https://oauth2.googleapis.com/tokeninfo?id_token=" + url.QueryEscape(idToken)
  resp, err := http.Get(endpoint)
  if err != nil {
    return nil, err
  }
  defer resp.Body.Close()
  if resp.StatusCode >= 400 {
    return nil, fmt.Errorf("tokeninfo error")
  }
  body, err := io.ReadAll(resp.Body)
  if err != nil {
    return nil, err
  }
  var info googleTokenInfo
  if err := json.Unmarshal(body, &info); err != nil {
    return nil, err
  }
  if info.Aud != clientID {
    return nil, fmt.Errorf("aud mismatch")
  }
  if strings.ToLower(strings.TrimSpace(info.EmailVerified)) != "true" {
    return nil, fmt.Errorf("email not verified")
  }
  if strings.TrimSpace(info.Email) == "" || strings.TrimSpace(info.Sub) == "" {
    return nil, fmt.Errorf("invalid token info")
  }
  return &info, nil
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
    email := strings.ToLower(strings.TrimSpace(req.Email))
    err := db.QueryRow(`SELECT id, password_hash, name, email, is_admin, role FROM users WHERE email = $1`, email).
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
    _, err = db.Exec(`INSERT INTO sessions (token, user_id, expires_at) VALUES ($1,$2,$3)`, token, id, sessionExpiry())
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
    email := strings.ToLower(strings.TrimSpace(req.Email))
    if req.Name == "" || email == "" || req.Phone == "" || req.Password == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("name, email, phone, password required"))
      return
    }
    hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("hash failed"))
      return
    }
    var userID string
    username, err := generateUsernameFromEmail(db, email)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("username generate failed"))
      return
    }
    err = db.QueryRow(`INSERT INTO users (name, username, email, phone, password_hash, is_admin, role) VALUES ($1,$2,$3,$4,$5,TRUE,'owner') RETURNING id`,
      req.Name, username, email, nullIfEmpty(normalizePhone(req.Phone)), string(hash)).Scan(&userID)
    if err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("admin create failed"))
      return
    }
    writeJSON(w, http.StatusOK, map[string]string{"admin_id": userID})
  }
}

func logoutHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    token := r.Header.Get("X-Auth-Token")
    if token == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("missing token"))
      return
    }
    _, _ = db.Exec(`DELETE FROM sessions WHERE token = $1`, token)
    writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
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
    var name, tier, username string
    var email, phone, avatar sql.NullString
    var totalSpend, wallet int
    err = db.QueryRow(`SELECT name, email, phone, tier, total_spend, wallet_balance, username, avatar_url FROM users WHERE id = $1`, userID).
      Scan(&name, &email, &phone, &tier, &totalSpend, &wallet, &username, &avatar)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("not found"))
      return
    }
    writeJSON(w, http.StatusOK, map[string]any{
      "id": userID,
      "name": name,
      "email": email.String,
      "phone": phone.String,
      "username": username,
      "avatar_url": avatar.String,
      "tier": tier,
      "total_spend": totalSpend,
      "wallet_balance": wallet,
    })
  }
}

func profileUpdateHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPut {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    userID, err := getUserIDFromToken(db, r)
    if err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
      return
    }
    var req ProfileUpdateRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
      return
    }
    name := strings.TrimSpace(req.Name)
    avatar := strings.TrimSpace(req.AvatarURL)
    username := strings.ToLower(strings.TrimSpace(req.Username))

    var currentUsername string
    var createdAt time.Time
    err = db.QueryRow(`SELECT username, created_at FROM users WHERE id = $1`, userID).Scan(&currentUsername, &createdAt)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("not found"))
      return
    }

    if username != "" && username != currentUsername {
      if err := validateUsername(username); err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg(err.Error()))
        return
      }
      if time.Now().After(createdAt.Add(30 * 24 * time.Hour)) {
        writeJSON(w, http.StatusBadRequest, errMsg("username change window expired"))
        return
      }
    } else if username == "" {
      username = currentUsername
    }

    _, err = db.Exec(`UPDATE users SET name = COALESCE($1,name), username = $2, avatar_url = COALESCE($3,avatar_url) WHERE id = $4`,
      nullIfEmpty(name), username, nullIfEmpty(avatar), userID)
    if err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("update failed"))
      return
    }
    writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
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
      var id, name, tier, createdAt string
      var email, phone sql.NullString
      var totalSpend, wallet int
      if err := rows.Scan(&id, &name, &email, &phone, &tier, &totalSpend, &wallet, &createdAt); err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      out = append(out, map[string]any{
        "id": id,
        "name": name,
        "email": email.String,
        "phone": phone.String,
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
      rows, err := db.Query(`SELECT code, title, discount_type, discount_value, min_spend, max_uses, uses, expires_at, active FROM vouchers ORDER BY code`)
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

func adminVoucherItemHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if _, err := requireRoles(db, r, "owner", "admin"); err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
      return
    }
    code := strings.TrimPrefix(r.URL.Path, "/admin/vouchers/")
    code = strings.TrimSpace(code)
    if code == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("missing code"))
      return
    }
    switch r.Method {
    case http.MethodPut:
      var req VoucherCreateRequest
      if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
        return
      }
      if req.Title == "" || req.DiscountType == "" || req.DiscountValue <= 0 {
        writeJSON(w, http.StatusBadRequest, errMsg("title, discount_type, discount_value required"))
        return
      }
      _, err := db.Exec(`UPDATE vouchers SET title = $1, discount_type = $2, discount_value = $3, min_spend = $4, max_uses = $5, expires_at = $6, active = $7 WHERE code = $8`,
        req.Title, req.DiscountType, req.DiscountValue, req.MinSpend, req.MaxUses, nullIfEmpty(req.ExpiresAt), req.Active, strings.ToUpper(code))
      if err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("update voucher failed"))
        return
      }
      writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
    case http.MethodDelete:
      _, err := db.Exec(`DELETE FROM vouchers WHERE code = $1`, strings.ToUpper(code))
      if err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("delete voucher failed"))
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
  err := db.QueryRow(`SELECT user_id FROM sessions WHERE token = $1 AND expires_at > NOW()`, token).Scan(&userID)
  return userID, err
}

func getUserIDFromTokenTx(tx *sql.Tx, r *http.Request) (string, error) {
  token := r.Header.Get("X-Auth-Token")
  if token == "" {
    return "", sql.ErrNoRows
  }
  var userID string
  err := tx.QueryRow(`SELECT user_id FROM sessions WHERE token = $1 AND expires_at > NOW()`, token).Scan(&userID)
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
      email := strings.ToLower(strings.TrimSpace(req.Email))
      if req.Name == "" || email == "" || req.Phone == "" || req.Password == "" {
        writeJSON(w, http.StatusBadRequest, errMsg("name, email, phone, password required"))
        return
      }
      username, err := generateUsernameFromEmail(db, email)
      if err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg("username generate failed"))
        return
      }
      hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
      if err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg("hash failed"))
        return
      }
      var userID string
      err = db.QueryRow(`INSERT INTO users (name, username, email, phone, password_hash, is_admin, role) VALUES ($1,$2,$3,$4,$5,TRUE,$6) RETURNING id`,
        req.Name, username, email, nullIfEmpty(normalizePhone(req.Phone)), string(hash), role).Scan(&userID)
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

func adminStaffItemHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if _, err := requireRoles(db, r, "owner", "admin"); err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
      return
    }
    id := strings.TrimPrefix(r.URL.Path, "/admin/staff/")
    id = strings.TrimSpace(id)
    if id == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("missing id"))
      return
    }
    switch r.Method {
    case http.MethodPut:
      var req AdminUserUpdateRequest
      if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
        return
      }
      role := strings.ToLower(strings.TrimSpace(req.Role))
      if role == "" {
        role = "staff"
      }
      email := strings.ToLower(strings.TrimSpace(req.Email))
      if req.Name == "" || email == "" || req.Phone == "" {
        writeJSON(w, http.StatusBadRequest, errMsg("name, email, phone required"))
        return
      }
      if strings.TrimSpace(req.Password) != "" {
        hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
        if err != nil {
          writeJSON(w, http.StatusInternalServerError, errMsg("hash failed"))
          return
        }
        _, err = db.Exec(`UPDATE users SET name = $1, email = $2, phone = $3, password_hash = $4, role = $5 WHERE id = $6 AND is_admin = TRUE`,
          req.Name, email, nullIfEmpty(normalizePhone(req.Phone)), string(hash), role, id)
        if err != nil {
          writeJSON(w, http.StatusBadRequest, errMsg("update staff failed"))
          return
        }
      } else {
        _, err := db.Exec(`UPDATE users SET name = $1, email = $2, phone = $3, role = $4 WHERE id = $5 AND is_admin = TRUE`,
          req.Name, email, nullIfEmpty(normalizePhone(req.Phone)), role, id)
        if err != nil {
          writeJSON(w, http.StatusBadRequest, errMsg("update staff failed"))
          return
        }
      }
      writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
    case http.MethodDelete:
      _, err := db.Exec(`DELETE FROM users WHERE id = $1 AND is_admin = TRUE`, id)
      if err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("delete staff failed"))
        return
      }
      writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
    default:
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
    }
  }
}

func adminDeliveryZoneItemHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if _, err := requireRoles(db, r, "owner", "admin"); err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
      return
    }
    id := strings.TrimPrefix(r.URL.Path, "/admin/delivery/zones/")
    id = strings.TrimSpace(id)
    if id == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("missing id"))
      return
    }
    switch r.Method {
    case http.MethodPut:
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
      _, err := db.Exec(`UPDATE delivery_zones SET name = $1, flat_fee = $2, active = $3 WHERE id = $4`, req.Name, req.FlatFee, req.Active, id)
      if err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("update zone failed"))
        return
      }
      writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
    case http.MethodDelete:
      _, err := db.Exec(`DELETE FROM delivery_zones WHERE id = $1`, id)
      if err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("delete zone failed"))
        return
      }
      writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
    default:
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
    }
  }
}

func adminProductsHandler(db *sql.DB) http.HandlerFunc {
  uploadHandler := productImageUploadHandler(db)
  return func(w http.ResponseWriter, r *http.Request) {
    if strings.HasSuffix(r.URL.Path, "/image") {
      uploadHandler(w, r)
      return
    }
    if _, err := requireRoles(db, r, "owner", "admin"); err != nil {
      writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
      return
    }
    id := strings.TrimPrefix(r.URL.Path, "/admin/products/")
    id = strings.TrimSpace(id)
    if id == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("missing id"))
      return
    }
    switch r.Method {
    case http.MethodPut:
      var req ProductCreateRequest
      if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
        return
      }
      if req.Name == "" || req.Price <= 0 || req.Stock < 0 {
        writeJSON(w, http.StatusBadRequest, errMsg("name, price, stock required"))
        return
      }
      categoryID := sql.NullString{}
      if strings.TrimSpace(req.Category) != "" {
        cid, err := ensureCategory(db, req.Category)
        if err != nil {
          writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
          return
        }
        categoryID = sql.NullString{String: cid, Valid: true}
      }
      _, err := db.Exec(`UPDATE products SET category_id = $1, name = $2, description = $3, price = $4, stock = $5 WHERE id = $6`,
        categoryID, req.Name, req.Description, req.Price, req.Stock, id)
      if err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("update product failed"))
        return
      }
      writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
    case http.MethodDelete:
      _, err := db.Exec(`DELETE FROM products WHERE id = $1`, id)
      if err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("delete product failed"))
        return
      }
      writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
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

func generateOTPCode() string {
  b := make([]byte, 3)
  _, _ = rand.Read(b)
  n := int(b[0])<<16 + int(b[1])<<8 + int(b[2])
  return fmt.Sprintf("%06d", n%1000000)
}

func consumeOtpToken(db *sql.DB, destination string, channel string, purpose string, token string) bool {
  destination = strings.TrimSpace(destination)
  channel = strings.ToLower(strings.TrimSpace(channel))
  purpose = strings.ToLower(strings.TrimSpace(purpose))
  token = strings.TrimSpace(token)
  if destination == "" || channel == "" || purpose == "" || token == "" {
    return false
  }
  var used bool
  err := db.QueryRow(`SELECT used FROM otp_tokens WHERE token = $1 AND destination = $2 AND channel = $3 AND purpose = $4 AND expires_at > NOW()`,
    token, destination, channel, purpose).Scan(&used)
  if err != nil || used {
    return false
  }
  _, err = db.Exec(`UPDATE otp_tokens SET used = TRUE WHERE token = $1`, token)
  return err == nil
}

func sessionExpiry() time.Time {
  ttl := 168
  if v := strings.TrimSpace(os.Getenv("SESSION_TTL_HOURS")); v != "" {
    if n, err := strconv.Atoi(v); err == nil && n > 0 {
      ttl = n
    }
  }
  return time.Now().Add(time.Duration(ttl) * time.Hour)
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

func applyVoucherTx(tx *sql.Tx, code string, subtotal int, userID string) (int, error) {
  if strings.TrimSpace(code) == "" {
    return 0, nil
  }
  var vType string
  var vVal, minSpend, maxUses, uses int
  var active bool
  var expiresAt sql.NullString
  err := tx.QueryRow(`SELECT discount_type, discount_value, min_spend, max_uses, uses, expires_at, active FROM vouchers WHERE code = $1`, strings.ToUpper(code)).
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
    err := tx.QueryRow(`SELECT CASE WHEN $1::date >= CURRENT_DATE THEN 1 ELSE 0 END`, expiresAt.String).Scan(&ok)
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
    err := tx.QueryRow(`SELECT used FROM user_vouchers WHERE user_id = $1 AND code = $2`, userID, strings.ToUpper(code)).Scan(&used)
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

  return discount, nil
}
