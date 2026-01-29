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
- POST /auth/register
- POST /auth/login
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
