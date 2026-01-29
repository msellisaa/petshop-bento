package main

type Product struct {
  ID          string `json:"id"`
  Name        string `json:"name"`
  Description string `json:"description"`
  Price       int    `json:"price"`
  Stock       int    `json:"stock"`
  ImageURL    string `json:"image_url"`
  Category    string `json:"category"`
}

type ProductCreateRequest struct {
  Name        string `json:"name"`
  Description string `json:"description"`
  Price       int    `json:"price"`
  Stock       int    `json:"stock"`
  ImageURL    string `json:"image_url"`
  Category    string `json:"category"`
}

type CartItemRequest struct {
  CartID    string `json:"cart_id"`
  ProductID string `json:"product_id"`
  Qty       int    `json:"qty"`
}

type CartItem struct {
  ID          string `json:"id"`
  Qty         int    `json:"qty"`
  ProductID   string `json:"product_id"`
  ProductName string `json:"product_name"`
  Price       int    `json:"price"`
}

type OrderRequest struct {
  CartID       string `json:"cart_id"`
  CustomerName string `json:"customer_name"`
  Phone        string `json:"phone"`
  Address      string `json:"address"`
  ShippingFee  int    `json:"shipping_fee"`
  VoucherCode  string `json:"voucher_code"`
  WalletUse    int    `json:"wallet_use"`
}

type AuthRegisterRequest struct {
  Name     string `json:"name"`
  Email    string `json:"email"`
  Phone    string `json:"phone"`
  Password string `json:"password"`
}

type AuthLoginRequest struct {
  Email    string `json:"email"`
  Password string `json:"password"`
}

type AdminBootstrapRequest struct {
  Name     string `json:"name"`
  Email    string `json:"email"`
  Phone    string `json:"phone"`
  Password string `json:"password"`
  Secret   string `json:"secret"`
}

type AdminUserCreateRequest struct {
  Name     string `json:"name"`
  Email    string `json:"email"`
  Phone    string `json:"phone"`
  Password string `json:"password"`
  Role     string `json:"role"`
}

type OrderStatusRequest struct {
  Status string `json:"status"`
}

type VoucherCreateRequest struct {
  Code          string `json:"code"`
  Title         string `json:"title"`
  DiscountType  string `json:"discount_type"`
  DiscountValue int    `json:"discount_value"`
  MinSpend      int    `json:"min_spend"`
  MaxUses       int    `json:"max_uses"`
  ExpiresAt     string `json:"expires_at"`
  Active        bool   `json:"active"`
}
