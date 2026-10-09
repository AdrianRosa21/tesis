@echo off
rem Detiene el servidor (puerto 8000) y la pagina web (puerto 5173) si quedaron abiertos.
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-NetTCPConnection -LocalPort 8000,5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }; Write-Host 'Listo: AURA local detenida.'"
pause
