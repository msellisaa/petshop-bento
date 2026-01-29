package com.petshop.booking.model;

public record ScheduleRequest(
  String doctor_name,
  String day_of_week,
  String start_time,
  String end_time,
  String location
) {}
