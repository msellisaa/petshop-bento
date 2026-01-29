# API Notes

## Core API (Go)
Base URL: http://localhost:8081

Auth:
- User token via `X-Auth-Token` from `/auth/login`
- Admin token via `X-Auth-Token` from `/admin/login`
- Service webhook via `X-Service-Secret` from `.env`

- GET /health
- GET /products
- GET /products/{id}
- POST /cart/items
- GET /cart
- POST /orders
  - body supports `voucher_code` and `wallet_use` (cashback amount)
- GET /delivery/zones
- POST /delivery/quote
  - body: `{ type: "zone|per_km|external", zone_id, lat, lng, distance_km }`
  - external provider response may include `message` when in placeholder mode
- POST /auth/register
- POST /auth/login
- POST /auth/otp/request
- POST /auth/otp/verify
- POST /auth/google/login
  - OTP via email uses SMTP_* env vars; fallback dev mode uses OTP_ECHO=true
- POST /auth/logout
- POST /admin/login
- POST /admin/bootstrap
- GET /admin/staff
- POST /admin/staff
- GET /me
- GET /me/vouchers
- GET /me/orders
- GET /vouchers
- GET /admin/members
- GET /admin/vouchers
- POST /admin/vouchers
- GET /admin/orders
- PUT /admin/orders/{id}/status
- POST /webhooks/midtrans
- POST /payments/midtrans/snap
- GET /payments/midtrans/status/{orderId}
- GET /admin/delivery/zones
- POST /admin/delivery/zones
- GET /admin/delivery/settings
- PUT /admin/delivery/settings
- POST /admin/products/{id}/image (multipart form field: image)

## Booking API (Java)
Base URL: http://localhost:8082

Admin auth:
- `X-Admin-Secret` header must match `BOOKING_ADMIN_SECRET`

- GET /health
- GET /schedules
- POST /appointments
- POST /services/booking
- POST /payments/midtrans/snap
- GET /payments/midtrans/status/{orderId}
- POST /payments/midtrans/webhook
- GET /admin/appointments
- GET /admin/service-bookings
