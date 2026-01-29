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
- PUT /cart/items
- DELETE /cart/items
- GET /cart
- POST /events
  - body: `{ session_id, event_type, product_id, metadata }`
  - event_type: view_product | add_to_cart | remove_cart | checkout | promo_click
- POST /orders
  - body supports `voucher_code` and `wallet_use` (cashback amount)
  - response includes `tracking_token` for secure tracking link
- GET /delivery/zones
- POST /delivery/quote
  - body: `{ type: "zone|per_km|external", zone_id, lat, lng, distance_km }`
  - external provider response may include `message` when in placeholder mode
- POST /delivery/track
  - driver update: `{ order_id, driver_id, status, lat, lng, speed_kph, heading }`
  - optional auth: `X-Driver-Token` must match `CORE_DRIVER_TOKEN` if set
  - rate limit applied per IP
- GET /delivery/track/{orderId}?token=...
  - requires `token` if order has `tracking_token`
  - returns `{ latest, trail }` (trail includes recent points)
  - rate limit applied per IP
- GET /delivery/track/{orderId}/stream?token=...
  - requires `token` if order has `tracking_token`
  - server-sent events (SSE), emits `tracking` events
  - rate limit applied per IP
- GET /geo/reverse?lat=...&lng=...
  - returns `{ address, locality, source }`, uses Google if `GOOGLE_MAPS_KEY` is set
- POST /auth/register
- POST /auth/login
  - `email` field accepts email or phone number
- POST /auth/otp/request
- POST /auth/otp/verify
- POST /auth/google/login
  - body: `{ id_token, phone }` (id_token from Google Identity Services)
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
- PUT /me/password
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
- GET /admin/expenses
- POST /admin/expenses
- PUT /admin/expenses/{id}
- DELETE /admin/expenses/{id}
- GET /admin/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD&group=day|month
- GET /admin/reports/finance?from=YYYY-MM-DD&to=YYYY-MM-DD
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
- GET /appointments?phone=...
- POST /services/booking
- GET /services/booking?phone=...
- POST /payments/midtrans/snap
- GET /payments/midtrans/status/{orderId}
- POST /payments/midtrans/webhook
- GET /admin/appointments
- GET /admin/service-bookings
- PUT /admin/appointments/{id}/status
- PUT /admin/service-bookings/{id}/status

## Recommendation API (Python)
Base URL: http://localhost:8090

- GET /health
- GET /recommendations?user_id=...&session_id=...&limit=6
