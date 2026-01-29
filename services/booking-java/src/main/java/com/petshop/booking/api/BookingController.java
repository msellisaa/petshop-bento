package com.petshop.booking.api;

import com.petshop.booking.db.BookingRepository;
import com.petshop.booking.model.AppointmentRequest;
import com.petshop.booking.model.ServiceBookingRequest;
import com.petshop.booking.model.ScheduleRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping
@CrossOrigin(origins = "*")
public class BookingController {
  private final BookingRepository repo;
  private final String adminSecret;

  public BookingController(BookingRepository repo, @Value("${booking.adminSecret}") String adminSecret) {
    this.repo = repo;
    this.adminSecret = adminSecret;
  }

  @GetMapping("/health")
  public Map<String, String> health() {
    return Map.of("status", "ok");
  }

  @GetMapping("/schedules")
  public List<Map<String, Object>> schedules() {
    return repo.listSchedules();
  }

  @PostMapping("/schedules")
  public ResponseEntity<Map<String, String>> createSchedule(@RequestBody ScheduleRequest req, @RequestHeader(value = "X-Admin-Secret", required = false) String secret) {
    if (!isAdmin(secret)) {
      return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
    }
    String id = repo.createSchedule(req);
    return ResponseEntity.ok(Map.of("schedule_id", id));
  }

  @PostMapping("/appointments")
  public ResponseEntity<Map<String, String>> createAppointment(@RequestBody AppointmentRequest req) {
    String id = repo.createAppointment(req);
    return ResponseEntity.ok(Map.of("appointment_id", id));
  }

  @PostMapping("/services/booking")
  public ResponseEntity<Map<String, String>> createService(@RequestBody ServiceBookingRequest req) {
    String id = repo.createServiceBooking(req);
    return ResponseEntity.ok(Map.of("booking_id", id));
  }

  @GetMapping("/admin/appointments")
  public ResponseEntity<?> appointments(@RequestHeader(value = "X-Admin-Secret", required = false) String secret) {
    if (!isAdmin(secret)) {
      return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
    }
    return repo.listAppointments();
  }

  @GetMapping("/admin/service-bookings")
  public ResponseEntity<?> serviceBookings(@RequestHeader(value = "X-Admin-Secret", required = false) String secret) {
    if (!isAdmin(secret)) {
      return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
    }
    return repo.listServiceBookings();
  }

  private boolean isAdmin(String secret) {
    if (adminSecret == null || adminSecret.isBlank()) {
      return false;
    }
    return adminSecret.equals(secret);
  }
}
