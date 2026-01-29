package main

import "testing"

func TestHaversineKm(t *testing.T) {
  dist := haversineKm(-6.2216339, 106.3457304, -6.2216339, 106.3457304)
  if dist != 0 {
    t.Fatalf("expected 0, got %f", dist)
  }
  dist = haversineKm(-6.2216, 106.3457, -6.2316, 106.3557)
  if dist <= 0 {
    t.Fatalf("expected positive distance, got %f", dist)
  }
}
