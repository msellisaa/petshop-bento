package com.petshop.booking.model;

import java.util.List;

public record MidtransRequest(
  String order_id,
  int gross_amount,
  String first_name,
  String phone,
  String email,
  List<ItemDetail> items
) {
  public record ItemDetail(String id, String name, int price, int quantity) {}
}
