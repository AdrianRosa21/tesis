#!/bin/bash
# Arranca el backend de AURA y lo vuelve a levantar solo si se detiene (por un fallo, no por un ordenado Ctrl+C).
# Lo usa restaurar_pod.sh dentro de la sesion tmux "backend". Para detenerlo: tmux kill-session -t backend
cd /tesis/fastapi_backend || exit 1
source venv/bin/activate

while true; do
  uvicorn main:app --host 127.0.0.1 --port 3000
  echo "[$(date +%T)] el backend se detuvo; se reinicia en 2 s"
  sleep 2
done
