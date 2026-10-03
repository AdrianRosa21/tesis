#!/bin/bash
# Restaura AURA en un pod de RunPod nuevo (contenedor limpio). Se puede ejecutar de nuevo sin romper nada.
#
#   curl -fsSL https://raw.githubusercontent.com/AdrianRosa21/tesis/main/scripts/restaurar_pod.sh -o /tmp/restaurar_pod.sh && bash /tmp/restaurar_pod.sh
#
# Necesita lo que SI se conserva entre pods, en /workspace:
#   /workspace/aura/tesis.tar.gz        copia del proyecto (luego se actualiza con git pull)
#   /workspace/aura/ollama-models.tar   modelos de Ollama (5.6 GB)
#   /workspace/aura/secrets/cloudflare-token
#   /workspace/tesis/.env               claves (API_KEY, OPENAI_API_KEY...)
#   /workspace/aura/tts/                voz en ingles (se descarga sola si falta)
# Tarda unos 3 minutos. Al final imprime LISTO o la lista de problemas.

export DEBIAN_FRONTEND=noninteractive
PROBLEMAS=()
paso() { echo; echo "[$(date +%H:%M:%S)] PASO $1"; }
aviso() { echo "AVISO: $1"; PROBLEMAS+=("$1"); }
fallo() { echo; echo "FALLO: $1"; echo "Corrige eso y vuelve a ejecutar el comando (es seguro repetirlo)."; exit 1; }

paso "1/9 paquetes del sistema"
apt-get update -qq && apt-get install -y -qq curl git tmux python3-venv python3-pip poppler-utils zstd >/dev/null || fallo "no se pudieron instalar los paquetes (apt)"

paso "2/9 codigo (rama main)"
if [ ! -d /tesis/.git ]; then
  tar -xzf /workspace/aura/tesis.tar.gz -C / || fallo "no se pudo restaurar /workspace/aura/tesis.tar.gz"
fi
cd /tesis || fallo "no existe /tesis"
git fetch origin -q && git switch main -q 2>/dev/null
git pull --ff-only -q || fallo "git pull fallo (puede haber cambios locales en /tesis o no hay internet)"
git log --oneline -1

paso "3/9 claves (.env)"
if [ ! -f /tesis/.env ]; then
  cp /workspace/tesis/.env /tesis/.env 2>/dev/null || fallo "no existe /tesis/.env ni /workspace/tesis/.env"
fi
echo "variables definidas (solo nombres):"; sed -E 's/=.*/=.../' /tesis/.env | grep -v '^#' | grep -v '^$' | sed 's/^/   /'
grep -q '^API_KEY=.\+' /tesis/.env || fallo "el .env no tiene API_KEY"
grep -qE '^(OPENAI|GEMINI|ANTHROPIC)_API_KEY=.+' /tesis/.env || aviso "no hay clave de la nube: AURA usara solo Ollama (mas lento)"

paso "4/9 Ollama y modelo de vision"
command -v ollama >/dev/null || { curl -fsSL https://ollama.com/install.sh | sh >/tmp/ollama-install.log 2>&1 || fallo "no se pudo instalar Ollama (ver /tmp/ollama-install.log)"; }
levantar_ollama() {
  tmux kill-session -t ollama 2>/dev/null
  tmux new-session -d -s ollama "ollama serve"
  for i in $(seq 1 20); do curl -s -m 2 http://127.0.0.1:11434/api/tags >/dev/null && return 0; sleep 1; done
  return 1
}
curl -s -m 3 http://127.0.0.1:11434/api/tags >/dev/null || levantar_ollama || fallo "Ollama no arranca"
if ! ollama list 2>/dev/null | grep -q qwen2.5vl; then
  echo "restaurando el modelo desde /workspace (5.6 GB, tarda un par de minutos)..."
  mkdir -p /root/.ollama && tar -xf /workspace/aura/ollama-models.tar -C /root/.ollama || fallo "no se pudo restaurar los modelos de Ollama"
  levantar_ollama || fallo "Ollama no arranca despues de restaurar los modelos"
fi
ollama list | head -3
ollama list 2>/dev/null | grep -q qwen2.5vl || aviso "qwen2.5vl no aparece en ollama list (el respaldo local no funcionara)"

paso "5/9 dependencias de Python"
cd /tesis/fastapi_backend || fallo "no existe /tesis/fastapi_backend"
[ -d venv ] || python3 -m venv venv
source venv/bin/activate
pip install -q -r requirements.txt || fallo "pip no pudo instalar requirements.txt"
if pip install -q -r requirements-tts.txt; then
  [ -f /workspace/aura/tts/en_US-lessac-medium.onnx ] \
    || python -m piper.download_voices --download-dir /workspace/aura/tts en_US-lessac-medium >/dev/null 2>&1 \
    || aviso "no se pudo descargar la voz en ingles del servidor (se usara la del navegador)"
else
  aviso "no se pudo instalar Piper (voz en ingles del servidor); se usara la del navegador"
fi

paso "6/9 pruebas automaticas del backend"
cd /tesis && python -W ignore -m unittest fastapi_backend.test_prompt_policy fastapi_backend.test_cloud_pipeline \
  fastapi_backend.test_api fastapi_backend.test_tts 2>&1 | grep -E '^(Ran|OK|FAILED|FAIL:|ERROR:)'
[ "${PIPESTATUS[0]}" = "0" ] || aviso "alguna prueba automatica fallo (revisa arriba)"

paso "7/9 backend (se reinicia solo si se cae)"
tmux kill-session -t backend 2>/dev/null
tmux new-session -d -s backend "bash /tesis/scripts/correr_backend.sh"
for i in $(seq 1 40); do curl -s -m 3 http://127.0.0.1:3000/api/health >/dev/null && break; sleep 1; done
curl -s -m 8 http://127.0.0.1:3000/api/ready || fallo "el backend no responde en el puerto 3000 (tmux attach -t backend)"
echo

paso "8/9 tunel de Cloudflare (api.aura4blinds.online)"
if ! command -v cloudflared >/dev/null; then
  if [ -x /workspace/aura/bin/cloudflared ]; then cp /workspace/aura/bin/cloudflared /usr/local/bin/cloudflared
  else curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared || fallo "no se pudo bajar cloudflared"
  fi
  chmod +x /usr/local/bin/cloudflared
fi
[ -f /workspace/aura/secrets/cloudflare-token ] || fallo "falta /workspace/aura/secrets/cloudflare-token"
tmux kill-session -t tunnel 2>/dev/null
tmux new-session -d -s tunnel "cloudflared tunnel --no-autoupdate run --token-file /workspace/aura/secrets/cloudflare-token"
PUBLICO=""
for i in $(seq 1 30); do
  PUBLICO=$(curl -s -m 5 https://api.aura4blinds.online/api/ready) && echo "$PUBLICO" | grep -q '"status":"ready"' && break
  PUBLICO=""; sleep 2
done

paso "9/9 resumen"
echo "local:   $(curl -s -m 5 http://127.0.0.1:3000/api/ready)"
echo "publico: ${PUBLICO:-SIN RESPUESTA (el tunel no conecto; revisa: tmux attach -t tunnel)}"
echo "sesiones tmux: $(tmux ls 2>/dev/null | cut -d: -f1 | tr '\n' ' ')"
echo
if [ -z "$PUBLICO" ]; then
  echo "NO LISTO: el servidor funciona pero la direccion publica no responde."; exit 1
elif [ ${#PROBLEMAS[@]} -gt 0 ]; then
  echo "LISTO, pero con avisos:"; printf '  - %s\n' "${PROBLEMAS[@]}"
else
  echo "LISTO. Siguiente paso: probar con  python scripts/smoke_demo.py  desde tu computadora."
fi
