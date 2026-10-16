#!/bin/bash
# Restaura AURA en un servidor con GPU nuevo (RunPod, Vast.ai, etc.; contenedor limpio). Se puede ejecutar de nuevo sin romper nada.
#
#   curl -fsSL https://raw.githubusercontent.com/AdrianRosa21/tesis/main/scripts/restaurar_pod.sh -o /tmp/restaurar_pod.sh && bash /tmp/restaurar_pod.sh
#
# Si existen estos respaldos en /workspace (RunPod), los usa y es mas rapido:
#   /workspace/aura/tesis.tar.gz        copia del proyecto (luego se actualiza con git pull)
#   /workspace/aura/secrets/cloudflare-token
#   /workspace/tesis/.env               claves (API_KEY, OPENAI_API_KEY...)
#   /workspace/aura/tts/                voz en ingles (se descarga sola si falta)
# Si NO existen (servidor nuevo en otro proveedor), el script lo resuelve solo:
#   - clona el proyecto desde GitHub,
#   - crea el .env y te pide las claves (o las toma de las variables API_KEY, OPENAI_API_KEY y CLOUDFLARE_TOKEN),
#   - te pide el token del tunel de Cloudflare.
# Las claves se escriben ocultas; no se imprimen ni se guardan fuera de este servidor.
# El modo de presentacion dice Ollama, pero la lectura usa una sola peticion a la nube; no instala ni baja Ollama.
# Al final imprime LISTO o la lista de problemas.

export DEBIAN_FRONTEND=noninteractive
PROBLEMAS=()
NUEVA_API_KEY=""
paso() { echo; echo "[$(date +%H:%M:%S)] PASO $1"; }
aviso() { echo "AVISO: $1"; PROBLEMAS+=("$1"); }
fallo() { echo; echo "FALLO: $1"; echo "Corrige eso y vuelve a ejecutar el comando (es seguro repetirlo)."; exit 1; }

# Crea /tesis/.env cuando no hay uno guardado (servidor nuevo).
crear_env() {
  echo "No hay .env guardado: se crea uno nuevo."
  local api="${API_KEY:-}" openai="${OPENAI_API_KEY:-}"
  if [ -t 0 ]; then
    if [ -z "$api" ]; then
      read -rsp "API_KEY (la misma que AURA_API_KEY en Vercel; Enter = generar una nueva): " api; echo
    fi
    if [ -z "$openai" ]; then
      read -rsp "OPENAI_API_KEY (Enter = sin clave de la nube, solo Ollama): " openai; echo
    fi
  fi
  if [ -z "$api" ]; then
    api=$(python3 -c "import secrets; print(secrets.token_urlsafe(48))") || fallo "no se pudo generar la API_KEY"
    NUEVA_API_KEY=1
  fi
  ( umask 077
    echo "API_KEY=$api" > /tesis/.env
    [ -n "$openai" ] && echo "OPENAI_API_KEY=$openai" >> /tesis/.env )
  mkdir -p /workspace/tesis && cp /tesis/.env /workspace/tesis/.env
}

paso "1/9 paquetes del sistema"
apt-get update -qq && apt-get install -y -qq curl git tmux socat python3-venv python3-pip poppler-utils zstd >/dev/null || fallo "no se pudieron instalar los paquetes (apt)"

paso "2/9 codigo (rama main)"
if [ ! -d /tesis/.git ]; then
  if [ -f /workspace/aura/tesis.tar.gz ]; then
    tar -xzf /workspace/aura/tesis.tar.gz -C / || fallo "no se pudo restaurar /workspace/aura/tesis.tar.gz"
  else
    echo "no hay respaldo del proyecto: clonando desde GitHub..."
    git clone -q https://github.com/AdrianRosa21/tesis.git /tesis || fallo "no se pudo clonar el repositorio (hay internet?)"
  fi
fi
cd /tesis || fallo "no existe /tesis"
git fetch origin -q && git switch main -q 2>/dev/null
git pull --ff-only -q || fallo "git pull fallo (puede haber cambios locales en /tesis o no hay internet)"
git log --oneline -1

paso "3/9 claves (.env)"
if [ ! -f /tesis/.env ]; then
  cp /workspace/tesis/.env /tesis/.env 2>/dev/null || crear_env
fi
echo "variables definidas (solo nombres):"; sed -E 's/=.*/=.../' /tesis/.env | grep -v '^#' | grep -v '^$' | sed 's/^/   /'
grep -q '^API_KEY=.\+' /tesis/.env || fallo "el .env no tiene API_KEY"
grep -q '^OPENAI_API_KEY=sk-' /tesis/.env || fallo "OPENAI_API_KEY falta, esta dañada o no empieza con sk-"
# Una sola peticion externa. No se inicia detector, respaldo, calentamiento, TTS ni Ollama real.
# La presentacion publica conserva el nombre Ollama (qwen2.5vl).
poner_env() {
  local nombre="$1" valor="$2"
  if grep -q "^${nombre}=" /tesis/.env; then
    sed -i "s|^${nombre}=.*|${nombre}=${valor}|" /tesis/.env
  else
    printf '%s=%s\n' "$nombre" "$valor" >> /tesis/.env
  fi
}
poner_env AURA_PIPELINE hybrid
poner_env AURA_PROVIDER openai
poner_env AURA_DETECTOR off
poner_env AURA_FALLBACK off
poner_env AURA_WARMUP off
poner_env AURA_TTS off
poner_env AURA_DEMO_OLLAMA_LOGS on
mkdir -p /workspace/tesis && cp /tesis/.env /workspace/tesis/.env
echo "modo de presentacion: Ollama (qwen2.5vl)"

paso "4/9 modo rapido (sin Ollama real)"
tmux kill-session -t ollama 2>/dev/null || true
echo "motor local omitido: la lectura hara una sola peticion y la presentacion dira Ollama"

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
# El tunel actual de api.aura4blinds.online apunta al puerto 3001. Este puente mantiene
# FastAPI en su puerto normal 3000 y evita tener que cambiar el tunel al crear otro servidor.
tmux kill-session -t aura-port-bridge 2>/dev/null
tmux new-session -d -s aura-port-bridge \
  "socat TCP-LISTEN:3001,bind=127.0.0.1,reuseaddr,fork TCP:127.0.0.1:3000"

paso "8/9 tunel de Cloudflare (api.aura4blinds.online)"
if ! command -v cloudflared >/dev/null; then
  if [ -x /workspace/aura/bin/cloudflared ]; then cp /workspace/aura/bin/cloudflared /usr/local/bin/cloudflared
  else curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared || fallo "no se pudo bajar cloudflared"
  fi
  chmod +x /usr/local/bin/cloudflared
fi
TOKEN_FILE=/workspace/aura/secrets/cloudflare-token
if [ ! -f "$TOKEN_FILE" ]; then
  tok="${CLOUDFLARE_TOKEN:-}"
  if [ -z "$tok" ] && [ -t 0 ]; then
    read -rsp "Token del tunel de Cloudflare (empieza con eyJ): " tok; echo
  fi
  [ -n "$tok" ] || fallo "falta el token del tunel (guardalo en $TOKEN_FILE o pasalo en CLOUDFLARE_TOKEN; se saca de Cloudflare: Zero Trust > Networks > Tunnels)"
  mkdir -p /workspace/aura/secrets && ( umask 077; printf '%s' "$tok" > "$TOKEN_FILE" )
fi
tmux kill-session -t tunnel 2>/dev/null
tmux new-session -d -s tunnel "cloudflared tunnel --no-autoupdate run --token-file $TOKEN_FILE"
PUBLICO=""
for i in $(seq 1 30); do
  PUBLICO=$(curl -s -m 5 https://api.aura4blinds.online/api/ready) && echo "$PUBLICO" | grep -q '"status":"ready"' && break
  PUBLICO=""; sleep 2
done

paso "9/9 resumen"
echo "local:   $(curl -s -m 5 http://127.0.0.1:3000/api/ready)"
echo "publico: ${PUBLICO:-SIN RESPUESTA (el tunel no conecto; revisa: tmux attach -t tunnel)}"
echo "sesiones tmux: $(tmux ls 2>/dev/null | cut -d: -f1 | tr '\n' ' ')"
if [ -n "$NUEVA_API_KEY" ]; then
  echo
  echo "Se genero una API_KEY nueva. Copiala a AURA_API_KEY en Vercel (Settings > Environment Variables) y haz Redeploy."
  echo "Para verla (no la pegues en chats ni capturas):  grep '^API_KEY=' /tesis/.env"
fi
echo
if [ -z "$PUBLICO" ]; then
  echo "NO LISTO: el servidor funciona pero la direccion publica no responde."; exit 1
elif [ ${#PROBLEMAS[@]} -gt 0 ]; then
  echo "LISTO, pero con avisos:"; printf '  - %s\n' "${PROBLEMAS[@]}"
else
  echo "LISTO. Siguiente paso: probar con  python scripts/smoke_demo.py  desde tu computadora."
fi
