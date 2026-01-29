package com.petshop.booking.model;

public record ServiceBookingRequest(
  String customer_name,
  String phone,
  String service_type,
  String notes,
  String date
) {}
