package main

import (
  "database/sql"
  "log"
  "net/http"
  "os"

  _ "github.com/lib/pq"
)

func main() {
  db := mustDB()
  defer db.Close()

  mux := http.NewServeMux()
  mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
    writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
  })

  mux.HandleFunc("/products", productsHandler(db))
  mux.HandleFunc("/products/", productHandler(db))
  mux.HandleFunc("/cart/items", cartItemHandler(db))
  mux.HandleFunc("/cart", cartHandler(db))
  mux.HandleFunc("/orders", orderHandler(db))
  mux.HandleFunc("/delivery/zones", deliveryZonesHandler(db))
  mux.HandleFunc("/delivery/quote", deliveryQuoteHandler(db))
  mux.HandleFunc("/auth/register", registerHandler(db))
  mux.HandleFunc("/auth/login", loginHandler(db))
  mux.HandleFunc("/admin/login", adminLoginHandler(db))
  mux.HandleFunc("/admin/bootstrap", adminBootstrapHandler(db))
  mux.HandleFunc("/admin/staff", adminStaffHandler(db))
  mux.HandleFunc("/admin/delivery/zones", adminDeliveryZonesHandler(db))
  mux.HandleFunc("/admin/delivery/settings", adminDeliverySettingsHandler(db))
  mux.HandleFunc("/me", meHandler(db))
  mux.HandleFunc("/me/vouchers", meVouchersHandler(db))
  mux.HandleFunc("/me/orders", meOrdersHandler(db))
  mux.HandleFunc("/vouchers", vouchersHandler(db))
  mux.HandleFunc("/admin/members", membersHandler(db))
  mux.HandleFunc("/admin/vouchers", adminVouchersHandler(db))
  mux.HandleFunc("/admin/orders", adminOrdersHandler(db))
  mux.HandleFunc("/admin/orders/", adminOrderStatusHandler(db))
  mux.HandleFunc("/webhooks/midtrans", midtransWebhookHandler(db))

  handler := withCORS(mux)

  port := getenv("CORE_PORT", "8081")
  log.Printf("core api on :%s", port)
  if err := http.ListenAndServe(":"+port, handler); err != nil {
    log.Fatal(err)
  }
}

func mustDB() *sql.DB {
  dsn := os.Getenv("CORE_DB_URL")
  if dsn == "" {
    dsn = "postgres://petshop:petshop@localhost:5433/petshop_core?sslmode=disable"
  }
  db, err := sql.Open("postgres", dsn)
  if err != nil {
    log.Fatal(err)
  }
  if err := db.Ping(); err != nil {
    log.Fatal(err)
  }
  return db
}

func getenv(k, def string) string {
  v := os.Getenv(k)
  if v == "" {
    return def
  }
  return v
}
