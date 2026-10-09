@echo off
rem Doble clic para levantar AURA en tu PC (servidor + pagina web) usando OpenAI.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1" %*
if errorlevel 1 (
  echo.
  echo Algo fallo. Lee el mensaje de arriba.
  pause
)
