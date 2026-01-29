param(
  [string]$DbUrl = $env:CORE_DB_URL
)

if (-not $DbUrl) {
  Write-Host "CORE_DB_URL tidak ditemukan. Set environment variable CORE_DB_URL." -ForegroundColor Yellow
  exit 1
}

$scriptPath = Join-Path $PSScriptRoot "migrations/20260129_add_events.sql"
if (-not (Test-Path $scriptPath)) {
  Write-Host "File migrasi tidak ditemukan: $scriptPath" -ForegroundColor Red
  exit 1
}

Write-Host "Menjalankan migrasi events..."
psql "$DbUrl" -f "$scriptPath"
