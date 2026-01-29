package main

import (
  "encoding/json"
  "fmt"
  "io"
  "net/http"
  "os"
  "strconv"
  "time"
)

type reverseGeoResponse struct {
  Address  string `json:"address"`
  Locality string `json:"locality"`
  Source   string `json:"source"`
}

type googleGeoResponse struct {
  Results []struct {
    FormattedAddress string `json:"formatted_address"`
    AddressComponents []struct {
      LongName string   `json:"long_name"`
      Types    []string `json:"types"`
    } `json:"address_components"`
  } `json:"results"`
}

type nominatimResponse struct {
  DisplayName string `json:"display_name"`
  Address     struct {
    City    string `json:"city"`
    Town    string `json:"town"`
    Village string `json:"village"`
    County  string `json:"county"`
    State   string `json:"state"`
  } `json:"address"`
}

func reverseGeoHandler(w http.ResponseWriter, r *http.Request) {
  if r.Method != http.MethodGet {
    writeJSON(w, http.StatusMethodNotAllowed, errMsg("method not allowed"))
    return
  }
  latStr := r.URL.Query().Get("lat")
  lngStr := r.URL.Query().Get("lng")
  if latStr == "" || lngStr == "" {
    writeJSON(w, http.StatusBadRequest, errMsg("lat and lng required"))
    return
  }
  lat, err := strconv.ParseFloat(latStr, 64)
  if err != nil {
    writeJSON(w, http.StatusBadRequest, errMsg("invalid lat"))
    return
  }
  lng, err := strconv.ParseFloat(lngStr, 64)
  if err != nil {
    writeJSON(w, http.StatusBadRequest, errMsg("invalid lng"))
    return
  }

  if key := os.Getenv("GOOGLE_MAPS_KEY"); key != "" {
    out, err := reverseGeoGoogle(lat, lng, key)
    if err == nil && (out.Address != "" || out.Locality != "") {
      writeJSON(w, http.StatusOK, out)
      return
    }
  }
  out, err := reverseGeoNominatim(lat, lng)
  if err != nil {
    writeJSON(w, http.StatusBadGateway, errMsg("reverse geocode failed"))
    return
  }
  writeJSON(w, http.StatusOK, out)
}

func reverseGeoGoogle(lat, lng float64, key string) (reverseGeoResponse, error) {
  url := fmt.Sprintf("https://maps.googleapis.com/maps/api/geocode/json?latlng=%f,%f&key=%s", lat, lng, key)
  client := &http.Client{Timeout: 8 * time.Second}
  resp, err := client.Get(url)
  if err != nil {
    return reverseGeoResponse{}, err
  }
  defer resp.Body.Close()
  body, err := io.ReadAll(resp.Body)
  if err != nil {
    return reverseGeoResponse{}, err
  }
  var payload googleGeoResponse
  if err := json.Unmarshal(body, &payload); err != nil {
    return reverseGeoResponse{}, err
  }
  if len(payload.Results) == 0 {
    return reverseGeoResponse{}, nil
  }
  res := payload.Results[0]
  locality := ""
  for _, comp := range res.AddressComponents {
    for _, t := range comp.Types {
      if t == "locality" || t == "administrative_area_level_2" {
        locality = comp.LongName
        break
      }
    }
    if locality != "" {
      break
    }
  }
  return reverseGeoResponse{
    Address:  res.FormattedAddress,
    Locality: locality,
    Source:   "google",
  }, nil
}

func reverseGeoNominatim(lat, lng float64) (reverseGeoResponse, error) {
  url := fmt.Sprintf("https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=%f&lon=%f", lat, lng)
  req, err := http.NewRequest(http.MethodGet, url, nil)
  if err != nil {
    return reverseGeoResponse{}, err
  }
  req.Header.Set("User-Agent", "petshop-bento/1.0 (reverse-geocode)")
  client := &http.Client{Timeout: 8 * time.Second}
  resp, err := client.Do(req)
  if err != nil {
    return reverseGeoResponse{}, err
  }
  defer resp.Body.Close()
  body, err := io.ReadAll(resp.Body)
  if err != nil {
    return reverseGeoResponse{}, err
  }
  var payload nominatimResponse
  if err := json.Unmarshal(body, &payload); err != nil {
    return reverseGeoResponse{}, err
  }
  locality := payload.Address.City
  if locality == "" {
    locality = payload.Address.Town
  }
  if locality == "" {
    locality = payload.Address.Village
  }
  if locality == "" {
    locality = payload.Address.County
  }
  if locality == "" {
    locality = payload.Address.State
  }
  return reverseGeoResponse{
    Address:  payload.DisplayName,
    Locality: locality,
    Source:   "nominatim",
  }, nil
}
