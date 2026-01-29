package com.petshop.booking.service;

import com.petshop.booking.model.MidtransRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

@Service
public class MidtransService {
  private final RestTemplate rest = new RestTemplate();
  private final String serverKey;
  private final String snapUrl;
  private final String statusUrl;
  private final String webhookUrl;
  private final String webhookSecret;

  public MidtransService(
    @Value("${midtrans.serverKey}") String serverKey,
    @Value("${midtrans.snapUrl}") String snapUrl,
    @Value("${midtrans.statusUrl}") String statusUrl,
    @Value("${core.webhookUrl}") String webhookUrl,
    @Value("${core.webhookSecret}") String webhookSecret
  ) {
    this.serverKey = serverKey;
    this.snapUrl = snapUrl;
    this.statusUrl = statusUrl;
    this.webhookUrl = webhookUrl;
    this.webhookSecret = webhookSecret;
  }

  public Map<String, Object> createSnap(MidtransRequest req) {
    if (serverKey == null || serverKey.isBlank()) {
      Map<String, Object> mock = new HashMap<>();
      mock.put("token", "MIDTRANS_SERVER_KEY_NOT_SET");
      mock.put("redirect_url", "");
      return mock;
    }

    Map<String, Object> payload = new HashMap<>();
    payload.put("transaction_details", Map.of(
      "order_id", req.order_id(),
      "gross_amount", req.gross_amount()
    ));
    payload.put("customer_details", Map.of(
      "first_name", req.first_name(),
      "phone", req.phone(),
      "email", req.email()
    ));
    payload.put("item_details", req.items());

    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    String basic = Base64.getEncoder().encodeToString((serverKey + ":").getBytes(StandardCharsets.UTF_8));
    headers.set("Authorization", "Basic " + basic);

    HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);
    ResponseEntity<Map> resp = rest.exchange(snapUrl, HttpMethod.POST, entity, Map.class);

    Map<String, Object> out = new HashMap<>();
    out.put("token", resp.getBody().get("token"));
    out.put("redirect_url", resp.getBody().get("redirect_url"));
    return out;
  }

  public Map<String, Object> getStatus(String orderId) {
    if (serverKey == null || serverKey.isBlank()) {
      Map<String, Object> mock = new HashMap<>();
      mock.put("transaction_status", "SERVER_KEY_NOT_SET");
      return mock;
    }
    HttpHeaders headers = new HttpHeaders();
    String basic = Base64.getEncoder().encodeToString((serverKey + ":").getBytes(StandardCharsets.UTF_8));
    headers.set("Authorization", "Basic " + basic);
    HttpEntity<Void> entity = new HttpEntity<>(headers);
    ResponseEntity<Map> resp = rest.exchange(statusUrl + "/" + orderId + "/status", HttpMethod.GET, entity, Map.class);
    return resp.getBody();
  }

  public Map<String, Object> forwardWebhook(Map<String, Object> payload) {
    if (webhookUrl == null || webhookUrl.isBlank()) {
      Map<String, Object> mock = new HashMap<>();
      mock.put("status", "core webhook not set");
      return mock;
    }
    HttpHeaders headers = new HttpHeaders();
    headers.setContentType(MediaType.APPLICATION_JSON);
    if (webhookSecret != null && !webhookSecret.isBlank()) {
      headers.set("X-Service-Secret", webhookSecret);
    }
    HttpEntity<Map<String, Object>> entity = new HttpEntity<>(payload, headers);
    ResponseEntity<Map> resp = rest.exchange(webhookUrl, HttpMethod.POST, entity, Map.class);
    return resp.getBody();
  }
}
