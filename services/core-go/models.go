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
  Username string `json:"username"`
  Email    string `json:"email"`
  Phone    string `json:"phone"`
  Password string `json:"password"`
  OtpToken string `json:"otp_token"`
  AvatarURL string `json:"avatar_url"`
  OtpChannel string `json:"otp_channel"`
}

type AuthLoginRequest struct {
  Email    string `json:"email"`
  Password string `json:"password"`
}

type OtpRequest struct {
  Email   string `json:"email"`
  Phone   string `json:"phone"`
  Channel string `json:"channel"`
  Purpose string `json:"purpose"`
}

type OtpVerifyRequest struct {
  Email   string `json:"email"`
  Phone   string `json:"phone"`
  Channel string `json:"channel"`
  Purpose string `json:"purpose"`
  Code    string `json:"code"`
}

type GoogleLoginRequest struct {
  Email    string `json:"email"`
  Name     string `json:"name"`
  Phone    string `json:"phone"`
  GoogleID string `json:"google_id"`
}

type ProfileUpdateRequest struct {
  Name      string `json:"name"`
  Username  string `json:"username"`
  AvatarURL string `json:"avatar_url"`
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

type DeliveryQuoteRequest struct {
  Type     string  `json:"type"`
  ZoneID   string  `json:"zone_id"`
  Lat      float64 `json:"lat"`
  Lng      float64 `json:"lng"`
  Distance float64 `json:"distance_km"`
}

type DeliveryZoneRequest struct {
  Name    string `json:"name"`
  FlatFee int    `json:"flat_fee"`
  Active  bool   `json:"active"`
}

type DeliverySettingsRequest struct {
  BaseLat  float64 `json:"base_lat"`
  BaseLng  float64 `json:"base_lng"`
  PerKm    int     `json:"per_km_rate"`
  MinFee   int     `json:"min_fee"`
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

type MidtransItem struct {
  ID       string `json:"id"`
  Name     string `json:"name"`
  Price    int    `json:"price"`
  Quantity int    `json:"quantity"`
}

type MidtransSnapRequest struct {
  OrderID     string         `json:"order_id"`
  GrossAmount int            `json:"gross_amount"`
  FirstName   string         `json:"first_name"`
  Phone       string         `json:"phone"`
  Email       string         `json:"email"`
  Items       []MidtransItem `json:"items"`
}
