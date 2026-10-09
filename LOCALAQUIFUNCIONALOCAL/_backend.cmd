@echo off
title AURA - Servidor local con OpenAI (cierra esta ventana para detenerlo)
cd /d "%~dp0.."
"fastapi_backend\venv\Scripts\python.exe" -m uvicorn fastapi_backend.main:app --host 127.0.0.1 --port 8000
echo.
echo El servidor se detuvo. Si fue por un error, esta arriba.
pause
