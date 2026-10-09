@echo off
title AURA - Pagina web local (cierra esta ventana para detenerla)
cd /d "%~dp0.."
call npm.cmd run dev -- --host localhost --port 5173 --strictPort
echo.
echo La pagina web se detuvo. Si fue por un error, esta arriba.
pause
