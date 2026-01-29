# Architecture

Monorepo:
- apps/web: customer web app
- apps/admin: admin dashboard
- services/core-go: products, orders, shipping
- services/booking-java: schedules, services, payment
- infra/db: SQL schemas

Service split:
- Go core owns product catalog, cart, checkout, delivery
- Java service owns appointments, grooming/boarding, Midtrans Snap payments
