package main

import (
  "database/sql"
  "encoding/json"
  "net/http"
  "os"
  "strings"
)

func productsHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    switch r.Method {
    case http.MethodGet:
      rows, err := db.Query(`SELECT p.id, p.name, p.description, p.price, p.stock, p.image_url, c.name FROM products p LEFT JOIN categories c ON p.category_id = c.id ORDER BY p.created_at DESC`)
      if err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      defer rows.Close()

      items := []Product{}
      for rows.Next() {
        var p Product
        if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.Stock, &p.ImageURL, &p.Category); err != nil {
          writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
          return
        }
        items = append(items, p)
      }
      writeJSON(w, http.StatusOK, items)
    case http.MethodPost:
      if _, err := requireRoles(db, r, "owner", "admin"); err != nil {
        writeJSON(w, http.StatusUnauthorized, errMsg("unauthorized"))
        return
      }
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
      if req.Category != "" {
        id, err := ensureCategory(db, req.Category)
        if err != nil {
          writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
          return
        }
        categoryID = sql.NullString{String: id, Valid: true}
      }

      var productID string
      err := db.QueryRow(`INSERT INTO products (category_id, name, description, price, stock, image_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        categoryID, req.Name, req.Description, req.Price, req.Stock, req.ImageURL).Scan(&productID)
      if err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      writeJSON(w, http.StatusOK, map[string]string{"product_id": productID})
    default:
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
    }
  }
}

func productHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    id := strings.TrimPrefix(r.URL.Path, "/products/")
    if id == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("missing id"))
      return
    }
    var p Product
    err := db.QueryRow(`SELECT p.id, p.name, p.description, p.price, p.stock, p.image_url, c.name FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.id = $1`, id).
      Scan(&p.ID, &p.Name, &p.Description, &p.Price, &p.Stock, &p.ImageURL, &p.Category)
    if err != nil {
      if err == sql.ErrNoRows {
        writeJSON(w, http.StatusNotFound, errMsg("not found"))
        return
      }
      writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
      return
    }
    writeJSON(w, http.StatusOK, p)
  }
}

func cartItemHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    switch r.Method {
    case http.MethodPost:
      var req CartItemRequest
      if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
        return
      }
      if req.ProductID == "" || req.Qty <= 0 {
        writeJSON(w, http.StatusBadRequest, errMsg("product_id and qty required"))
        return
      }

      cartID := req.CartID
      if cartID == "" {
        if err := db.QueryRow(`INSERT INTO carts DEFAULT VALUES RETURNING id`).Scan(&cartID); err != nil {
          writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
          return
        }
      }

      var existingID string
      err := db.QueryRow(`SELECT id FROM cart_items WHERE cart_id = $1 AND product_id = $2`, cartID, req.ProductID).Scan(&existingID)
      if err == nil {
        _, err = db.Exec(`UPDATE cart_items SET qty = qty + $1 WHERE id = $2`, req.Qty, existingID)
        if err != nil {
          writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
          return
        }
      } else if err == sql.ErrNoRows {
        _, err = db.Exec(`INSERT INTO cart_items (cart_id, product_id, qty) VALUES ($1, $2, $3)`, cartID, req.ProductID, req.Qty)
        if err != nil {
          writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
          return
        }
      } else {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      writeJSON(w, http.StatusOK, map[string]string{"cart_id": cartID})
    case http.MethodPut:
      var req CartItemRequest
      if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
        return
      }
      if req.CartID == "" || req.ProductID == "" {
        writeJSON(w, http.StatusBadRequest, errMsg("cart_id and product_id required"))
        return
      }
      if req.Qty <= 0 {
        _, err := db.Exec(`DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2`, req.CartID, req.ProductID)
        if err != nil {
          writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
          return
        }
        writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
        return
      }
      _, err := db.Exec(`UPDATE cart_items SET qty = $1 WHERE cart_id = $2 AND product_id = $3`, req.Qty, req.CartID, req.ProductID)
      if err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
    case http.MethodDelete:
      var req CartItemRequest
      if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
        writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
        return
      }
      if req.CartID == "" || req.ProductID == "" {
        writeJSON(w, http.StatusBadRequest, errMsg("cart_id and product_id required"))
        return
      }
      _, err := db.Exec(`DELETE FROM cart_items WHERE cart_id = $1 AND product_id = $2`, req.CartID, req.ProductID)
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

func cartHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodGet {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    cartID := r.URL.Query().Get("cart_id")
    if cartID == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("cart_id required"))
      return
    }
    rows, err := db.Query(`SELECT ci.id, ci.qty, p.id, p.name, p.price FROM cart_items ci JOIN products p ON ci.product_id = p.id WHERE ci.cart_id = $1`, cartID)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
      return
    }
    defer rows.Close()

    items := []CartItem{}
    for rows.Next() {
      var item CartItem
      if err := rows.Scan(&item.ID, &item.Qty, &item.ProductID, &item.ProductName, &item.Price); err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      items = append(items, item)
    }
    writeJSON(w, http.StatusOK, items)
  }
}

func orderHandler(db *sql.DB) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    if r.Method != http.MethodPost {
      writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
      return
    }
    var req OrderRequest
    if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg("invalid json"))
      return
    }
    if req.CartID == "" || req.CustomerName == "" || req.Phone == "" || req.Address == "" {
      writeJSON(w, http.StatusBadRequest, errMsg("cart_id, customer_name, phone, address required"))
      return
    }

    tx, err := db.Begin()
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("db error"))
      return
    }
    defer tx.Rollback()

    token := r.Header.Get("X-Auth-Token")
    userID := ""
    currentTier := "Bronze"
    totalSpend := 0
    walletBalance := 0
    tierInfo := TierInfo{Name: "Bronze", DiscountPct: 0, CashbackPct: 0}
    if token != "" {
      uid, err := getUserIDFromTokenTx(tx, r)
      if err != nil {
        writeJSON(w, http.StatusUnauthorized, errMsg("invalid session"))
        return
      }
      userID = uid
      _ = tx.QueryRow(`SELECT total_spend, tier, wallet_balance FROM users WHERE id = $1`, userID).Scan(&totalSpend, &currentTier, &walletBalance)
      if t, err := getTierInfo(db, totalSpend); err == nil {
        tierInfo = t
      }
    }

    var subtotal int
    err = tx.QueryRow(`SELECT COALESCE(SUM(p.price * ci.qty), 0) FROM cart_items ci JOIN products p ON ci.product_id = p.id WHERE ci.cart_id = $1`, req.CartID).Scan(&subtotal)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
      return
    }
    discount := subtotal * tierInfo.DiscountPct / 100

    voucherDiscount, err := applyVoucherTx(tx, req.VoucherCode, subtotal, userID)
    if err != nil {
      if isInvalid(err) {
        writeJSON(w, http.StatusBadRequest, errMsg(err.Error()))
        return
      }
      writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
      return
    }

    deliveryReq := DeliveryQuoteRequest{
      Type:     req.DeliveryType,
      ZoneID:   req.ZoneID,
      Lat:      req.Lat,
      Lng:      req.Lng,
      Distance: req.DistanceKm,
    }
    shippingFee, err := quoteShippingFee(db, deliveryReq)
    if err != nil {
      writeJSON(w, http.StatusBadRequest, errMsg(err.Error()))
      return
    }

    total := subtotal - discount - voucherDiscount + shippingFee
    if total < 0 {
      total = 0
    }
    cashback := total * tierInfo.CashbackPct / 100
    walletUsed := 0
    if userID != "" && req.WalletUse > 0 {
      walletUsed = req.WalletUse
      if walletUsed > walletBalance {
        walletUsed = walletBalance
      }
      if walletUsed > total {
        walletUsed = total
      }
      total = total - walletUsed
    }

    trackingToken, err := randToken(16)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("tracking token failed"))
      return
    }
    var orderID string
    err = tx.QueryRow(`INSERT INTO orders (cart_id, user_id, customer_name, phone, address, shipping_fee, subtotal, discount, voucher_code, cashback, wallet_used, total, tracking_token) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
      req.CartID, nullIfEmpty(userID), req.CustomerName, req.Phone, req.Address, shippingFee, subtotal, discount+voucherDiscount, nullIfEmpty(req.VoucherCode), cashback, walletUsed, total, trackingToken).
      Scan(&orderID)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
      return
    }

    if strings.TrimSpace(req.VoucherCode) != "" {
      _, _ = tx.Exec(`UPDATE vouchers SET uses = uses + 1 WHERE code = $1`, strings.ToUpper(req.VoucherCode))
      if userID != "" {
        _, _ = tx.Exec(`UPDATE user_vouchers SET used = TRUE WHERE user_id = $1 AND code = $2`, userID, strings.ToUpper(req.VoucherCode))
      }
    }

    items, err := tx.Query(`SELECT p.id, p.stock, ci.qty FROM cart_items ci JOIN products p ON ci.product_id = p.id WHERE ci.cart_id = $1 FOR UPDATE`, req.CartID)
    if err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
      return
    }
    defer items.Close()
    type stockItem struct {
      id  string
      qty int
      stk int
    }
    batch := []stockItem{}
    for items.Next() {
      var pid string
      var stock, qty int
      if err := items.Scan(&pid, &stock, &qty); err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
      if stock < qty {
        writeJSON(w, http.StatusBadRequest, errMsg("stock not enough"))
        return
      }
      batch = append(batch, stockItem{id: pid, qty: qty, stk: stock})
    }
    for _, it := range batch {
      _, err = tx.Exec(`UPDATE products SET stock = stock - $1 WHERE id = $2`, it.qty, it.id)
      if err != nil {
        writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
        return
      }
    }
    if _, err := tx.Exec(`DELETE FROM cart_items WHERE cart_id = $1`, req.CartID); err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg(err.Error()))
      return
    }

    responseTier := tierInfo.Name
    if userID != "" {
      grossTotal := total + walletUsed
      newTotal := totalSpend + grossTotal
      newTier := currentTier
      if t, err := getTierInfo(db, newTotal); err == nil {
        newTier = t.Name
      }
      _, _ = tx.Exec(`UPDATE users SET total_spend = $1, tier = $2, wallet_balance = wallet_balance + $3 - $4 WHERE id = $5`, newTotal, newTier, cashback, walletUsed, userID)
      if newTier != currentTier {
        code := rewardCodeForTier(newTier)
        if code != "" {
          _, _ = tx.Exec(`INSERT INTO user_vouchers (user_id, code) VALUES ($1,$2)`, userID, code)
        }
      }
      responseTier = newTier
    }
    if err := tx.Commit(); err != nil {
      writeJSON(w, http.StatusInternalServerError, errMsg("db commit failed"))
      return
    }
    writeJSON(w, http.StatusOK, map[string]any{
      "order_id": orderID,
      "tracking_token": trackingToken,
      "subtotal": subtotal,
      "discount": discount + voucherDiscount,
      "cashback": cashback,
      "wallet_used": walletUsed,
      "total": total,
      "tier": responseTier,
    })
  }
}

func withCORS(next http.Handler) http.Handler {
  return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
    origin := r.Header.Get("Origin")
    allowed := os.Getenv("FRONTEND_ORIGIN")
    if allowed == "" {
      w.Header().Set("Access-Control-Allow-Origin", "*")
    } else {
      allowedList := strings.Split(allowed, ",")
      matched := ""
      for _, v := range allowedList {
        v = strings.TrimSpace(v)
        if v != "" && v == origin {
          matched = v
          break
        }
      }
      if matched != "" {
        w.Header().Set("Access-Control-Allow-Origin", matched)
      } else if len(allowedList) > 0 {
        w.Header().Set("Access-Control-Allow-Origin", strings.TrimSpace(allowedList[0]))
      }
    }
    w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Auth-Token, X-Service-Secret, X-Admin-Secret, X-Driver-Token, X-Session-Id")
    w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS")
    if r.Method == http.MethodOptions {
      w.WriteHeader(http.StatusNoContent)
      return
    }
    next.ServeHTTP(w, r)
  })
}

func ensureCategory(db *sql.DB, name string) (string, error) {
  var id string
  err := db.QueryRow(`SELECT id FROM categories WHERE name = $1`, name).Scan(&id)
  if err == nil {
    return id, nil
  }
  if err != sql.ErrNoRows {
    return "", err
  }
  err = db.QueryRow(`INSERT INTO categories (name) VALUES ($1) RETURNING id`, name).Scan(&id)
  return id, err
}
