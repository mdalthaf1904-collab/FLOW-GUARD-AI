$Port = 8081
$Address = "127.0.0.1"

Set-Location $PSScriptRoot

Write-Host ""
Write-Host "========================================"
Write-Host "          FLOWGUARD AI"
Write-Host "========================================"
Write-Host "Project: $PSScriptRoot"
Write-Host ""
Write-Host "Starting local server..."
Write-Host "Website: http://127.0.0.1:8081/"
Write-Host ""
Write-Host "Press Ctrl+C to stop."
Write-Host "========================================"
Write-Host ""

Start-Process "http://127.0.0.1:8081/"

python -m http.server $Port --bind $Address