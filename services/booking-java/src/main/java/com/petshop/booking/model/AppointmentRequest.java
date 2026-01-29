package com.petshop.booking.model;

public record AppointmentRequest(
  String customer_name,
  String phone,
  String pet_name,
  String service_type,
  String schedule_id
) {}
