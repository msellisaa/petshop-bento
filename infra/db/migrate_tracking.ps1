param(
  [string]$DbUrl = $env:CORE_DB_URL
)

if (-not $DbUrl) {
  Write-Host "CORE_DB_URL tidak ditemukan. Set environment variable CORE_DB_URL." -ForegroundColor Yellow
  exit 1
}

$scripts = @(
  Join-Path $PSScriptRoot "migrations/20260129_add_delivery_tracking.sql",
  Join-Path $PSScriptRoot "migrations/20260129_add_tracking_security.sql"
)

foreach ($scriptPath in $scripts) {
  if (-not (Test-Path $scriptPath)) {
    Write-Host "File migrasi tidak ditemukan: $scriptPath" -ForegroundColor Red
    exit 1
  }
  Write-Host "Menjalankan migrasi: $scriptPath"
  psql "$DbUrl" -f "$scriptPath"
}
