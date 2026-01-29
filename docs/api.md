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
  - `email` field accepts email or phone number
- POST /auth/otp/request
- POST /auth/otp/verify
- POST /auth/google/login
  - OTP via email uses SMTP_* env vars; WhatsApp uses FONNTE_*; fallback dev mode uses OTP_ECHO=true
  - OTP request body accepts `email` or `phone` + optional `channel` (email|whatsapp|sms)
  - SMS delivery requires provider integration (not configured by default)
  - Register body supports `username` and optional `avatar_url`
  - Register body supports `otp_channel` (email|whatsapp|sms) to match OTP channel
- POST /auth/logout
- POST /admin/login
- POST /admin/bootstrap
- GET /admin/staff
- POST /admin/staff
- GET /me
- PUT /me/profile
  - Username can be updated within 30 days after account creation
- GET /me/vouchers
- GET /me/orders
- GET /vouchers
- GET /admin/members
- GET /admin/vouchers
- POST /admin/vouchers
- PUT /admin/vouchers/{code}
- DELETE /admin/vouchers/{code}
- GET /admin/orders
- PUT /admin/orders/{id}/status
- PUT /admin/staff/{id}
- DELETE /admin/staff/{id}
- POST /webhooks/midtrans
- POST /payments/midtrans/snap
- GET /payments/midtrans/status/{orderId}
- POST /uploads/avatar
- GET /admin/delivery/zones
- POST /admin/delivery/zones
- PUT /admin/delivery/zones/{id}
- DELETE /admin/delivery/zones/{id}
- GET /admin/delivery/settings
- PUT /admin/delivery/settings
- POST /admin/products/{id}/image (multipart form field: image)
- PUT /admin/products/{id}
- DELETE /admin/products/{id}

## Booking API (Java)
Base URL: http://localhost:8082

Admin auth:
- `X-Admin-Secret` header must match `BOOKING_ADMIN_SECRET`

- GET /health
- GET /schedules
- PUT /schedules/{id}
- DELETE /schedules/{id}
- POST /appointments
- POST /services/booking
- POST /payments/midtrans/snap
- GET /payments/midtrans/status/{orderId}
- POST /payments/midtrans/webhook
- GET /admin/appointments
- GET /admin/service-bookings
- PUT /admin/appointments/{id}/status
- PUT /admin/service-bookings/{id}/status
