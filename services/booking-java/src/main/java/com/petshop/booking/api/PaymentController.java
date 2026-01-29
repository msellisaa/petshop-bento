package com.petshop.booking.api;

import com.petshop.booking.model.MidtransRequest;
import com.petshop.booking.service.MidtransService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/payments/midtrans")
@CrossOrigin(origins = "*")
public class PaymentController {
  private final MidtransService service;

  public PaymentController(MidtransService service) {
    this.service = service;
  }

  @PostMapping("/snap")
  public ResponseEntity<Map<String, Object>> snap(@RequestBody MidtransRequest req) {
    return ResponseEntity.ok(service.createSnap(req));
  }

  @GetMapping("/status/{orderId}")
  public ResponseEntity<Map<String, Object>> status(@PathVariable String orderId) {
    return ResponseEntity.ok(service.getStatus(orderId));
  }

  @PostMapping("/webhook")
  public ResponseEntity<Map<String, Object>> webhook(@RequestBody Map<String, Object> payload) {
    return ResponseEntity.ok(service.forwardWebhook(payload));
  }
}
