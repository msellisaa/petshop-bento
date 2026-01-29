package com.petshop.booking.db;

import com.petshop.booking.model.AppointmentRequest;
import com.petshop.booking.model.ServiceBookingRequest;
import com.petshop.booking.model.ScheduleRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Repository
public class BookingRepository {
  private final JdbcTemplate jdbc;

  public BookingRepository(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
  }

  public List<Map<String, Object>> listSchedules() {
    return jdbc.queryForList("SELECT id, doctor_name, day_of_week, start_time, end_time, location FROM doctor_schedules");
  }

  public List<Map<String, Object>> listAppointments() {
    return jdbc.queryForList("SELECT id, customer_name, phone, pet_name, service_type, schedule_id, status, created_at FROM appointments ORDER BY created_at DESC");
  }

  public List<Map<String, Object>> listAppointmentsByPhone(String phone) {
    return jdbc.queryForList("SELECT id, customer_name, phone, pet_name, service_type, schedule_id, status, created_at FROM appointments WHERE phone = ? ORDER BY created_at DESC", phone);
  }

  public List<Map<String, Object>> listServiceBookings() {
    return jdbc.queryForList("SELECT id, customer_name, phone, service_type, notes, date, status, created_at FROM service_bookings ORDER BY created_at DESC");
  }

  public List<Map<String, Object>> listServiceBookingsByPhone(String phone) {
    return jdbc.queryForList("SELECT id, customer_name, phone, service_type, notes, date, status, created_at FROM service_bookings WHERE phone = ? ORDER BY created_at DESC", phone);
  }

  public String createSchedule(ScheduleRequest req) {
    String id = UUID.randomUUID().toString();
    jdbc.update("INSERT INTO doctor_schedules (id, doctor_name, day_of_week, start_time, end_time, location) VALUES (?,?,?,?,?,?)",
      id, req.doctor_name(), req.day_of_week(), req.start_time(), req.end_time(), req.location());
    return id;
  }

  public void updateSchedule(String id, ScheduleRequest req) {
    jdbc.update("UPDATE doctor_schedules SET doctor_name = ?, day_of_week = ?, start_time = ?, end_time = ?, location = ? WHERE id = ?",
      req.doctor_name(), req.day_of_week(), req.start_time(), req.end_time(), req.location(), id);
  }

  public void deleteSchedule(String id) {
    jdbc.update("DELETE FROM doctor_schedules WHERE id = ?", id);
  }

  public String createAppointment(AppointmentRequest req) {
    String id = UUID.randomUUID().toString();
    jdbc.update("INSERT INTO appointments (id, customer_name, phone, pet_name, service_type, schedule_id) VALUES (?,?,?,?,?,?)",
      id, req.customer_name(), req.phone(), req.pet_name(), req.service_type(), req.schedule_id());
    return id;
  }

  public void updateAppointmentStatus(String id, String status) {
    jdbc.update("UPDATE appointments SET status = ? WHERE id = ?", status, id);
  }

  public String createServiceBooking(ServiceBookingRequest req) {
    String id = UUID.randomUUID().toString();
    jdbc.update("INSERT INTO service_bookings (id, customer_name, phone, service_type, notes, date) VALUES (?,?,?,?,?,?)",
      id, req.customer_name(), req.phone(), req.service_type(), req.notes(), req.date());
    return id;
  }

  public void updateServiceBookingStatus(String id, String status) {
    jdbc.update("UPDATE service_bookings SET status = ? WHERE id = ?", status, id);
  }
}
