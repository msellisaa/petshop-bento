package com.petshop.booking.api;

import com.petshop.booking.model.MidtransRequest;
import com.petshop.booking.service.MidtransService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/payments/midtrans")
@CrossOrigin(origins = "*")
public class PaymentController {
  private final MidtransService service;
  private final String adminSecret;
  private final boolean requirePaymentSecret;

  public PaymentController(
    MidtransService service,
    @Value("${booking.adminSecret}") String adminSecret,
    @Value("${booking.requirePaymentSecret:false}") boolean requirePaymentSecret
  ) {
    this.service = service;
    this.adminSecret = adminSecret;
    this.requirePaymentSecret = requirePaymentSecret;
  }

  @PostMapping("/snap")
  public ResponseEntity<Map<String, Object>> snap(
    @RequestBody MidtransRequest req,
    @RequestHeader(value = "X-Admin-Secret", required = false) String secret
  ) {
    if (requirePaymentSecret && !isAdmin(secret)) {
      return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
    }
    return ResponseEntity.ok(service.createSnap(req));
  }

  @GetMapping("/status/{orderId}")
  public ResponseEntity<Map<String, Object>> status(
    @PathVariable String orderId,
    @RequestHeader(value = "X-Admin-Secret", required = false) String secret
  ) {
    if (requirePaymentSecret && !isAdmin(secret)) {
      return ResponseEntity.status(401).body(Map.of("error", "unauthorized"));
    }
    return ResponseEntity.ok(service.getStatus(orderId));
  }

  @PostMapping("/webhook")
  public ResponseEntity<Map<String, Object>> webhook(@RequestBody Map<String, Object> payload) {
    return ResponseEntity.ok(service.forwardWebhook(payload));
  }

  private boolean isAdmin(String secret) {
    if (adminSecret == null || adminSecret.isBlank()) {
      return false;
    }
    return adminSecret.equals(secret);
  }
}
