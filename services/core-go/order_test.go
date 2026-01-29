package main

import (
  "bytes"
  "encoding/json"
  "net/http"
  "net/http/httptest"
  "testing"

  "github.com/DATA-DOG/go-sqlmock"
)

func TestOrderHandlerRequiresDelivery(t *testing.T) {
  db, mock, err := sqlmock.New()
  if err != nil {
    t.Fatalf("sqlmock: %v", err)
  }
  defer db.Close()

  mock.ExpectBegin()
  mock.ExpectQuery(`SELECT COALESCE\(SUM\(p\.price \* ci\.qty\), 0\) FROM cart_items`).
    WithArgs("cart-1").
    WillReturnRows(sqlmock.NewRows([]string{"subtotal"}).AddRow(10000))
  mock.ExpectRollback()

  body, _ := json.Marshal(map[string]any{
    "cart_id": "cart-1",
    "customer_name": "Rina",
    "phone": "081234",
    "address": "Jl. Mawar",
    "voucher_code": "",
    "wallet_use": 0,
  })
  req := httptest.NewRequest(http.MethodPost, "/orders", bytes.NewReader(body))
  rec := httptest.NewRecorder()

  orderHandler(db).ServeHTTP(rec, req)

  if rec.Code != http.StatusBadRequest {
    t.Fatalf("expected 400, got %d", rec.Code)
  }
  if err := mock.ExpectationsWereMet(); err != nil {
    t.Fatalf("mock expectations: %v", err)
  }
}

func TestOrderHandlerClearsCartItems(t *testing.T) {
  db, mock, err := sqlmock.New()
  if err != nil {
    t.Fatalf("sqlmock: %v", err)
  }
  defer db.Close()

  mock.ExpectBegin()
  mock.ExpectQuery(`SELECT COALESCE\(SUM\(p\.price \* ci\.qty\), 0\) FROM cart_items`).
    WithArgs("cart-2").
    WillReturnRows(sqlmock.NewRows([]string{"subtotal"}).AddRow(20000))
  mock.ExpectQuery(`SELECT flat_fee FROM delivery_zones`).
    WithArgs("zone-1").
    WillReturnRows(sqlmock.NewRows([]string{"flat_fee"}).AddRow(5000))
  mock.ExpectQuery(`INSERT INTO orders`).
    WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow("order-1"))
  mock.ExpectQuery(`SELECT p\.id, p\.stock, ci\.qty FROM cart_items`).
    WithArgs("cart-2").
    WillReturnRows(sqlmock.NewRows([]string{"id", "stock", "qty"}).AddRow("prod-1", 10, 2))
  mock.ExpectExec(`UPDATE products SET stock = stock -`).
    WithArgs(2, "prod-1").
    WillReturnResult(sqlmock.NewResult(1, 1))
  mock.ExpectExec(`DELETE FROM cart_items WHERE cart_id =`).
    WithArgs("cart-2").
    WillReturnResult(sqlmock.NewResult(1, 1))
  mock.ExpectCommit()
  mock.ExpectRollback()

  body, _ := json.Marshal(map[string]any{
    "cart_id": "cart-2",
    "customer_name": "Rina",
    "phone": "081234",
    "address": "Jl. Mawar",
    "delivery_type": "zone",
    "zone_id": "zone-1",
    "voucher_code": "",
    "wallet_use": 0,
  })
  req := httptest.NewRequest(http.MethodPost, "/orders", bytes.NewReader(body))
  rec := httptest.NewRecorder()

  orderHandler(db).ServeHTTP(rec, req)

  if rec.Code != http.StatusOK {
    t.Fatalf("expected 200, got %d", rec.Code)
  }
  if err := mock.ExpectationsWereMet(); err != nil {
    t.Fatalf("mock expectations: %v", err)
  }
}
