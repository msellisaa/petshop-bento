CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE doctor_schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doctor_name TEXT NOT NULL,
  day_of_week TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  location TEXT NOT NULL
);

CREATE TABLE appointments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  pet_name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  schedule_id UUID REFERENCES doctor_schedules(id),
  status TEXT NOT NULL DEFAULT 'BOOKED',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE service_bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  service_type TEXT NOT NULL,
  notes TEXT,
  date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'BOOKED',
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO doctor_schedules (doctor_name, day_of_week, start_time, end_time, location)
VALUES ('Drh. Sinta', 'Senin', '09:00', '16:00', 'Petshop Bento - Cikande');
