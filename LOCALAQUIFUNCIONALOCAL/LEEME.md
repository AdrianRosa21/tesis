# AURA local (sin pod) con OpenAI

Sirve para correr y probar AURA **en tu PC** cuando no puedes encender el pod de RunPod.
No cambia nada del proyecto: solo arranca el servidor y la página de siempre, pero con OpenAI en lugar de Ollama.

## Cómo usarla

1. Doble clic en **`INICIAR.bat`**.
2. **La primera vez** te pide tu clave de OpenAI (la que empieza con `sk-`). Pégala y pulsa Enter (no se ve al escribir). Se guarda en `LOCALAQUIFUNCIONALOCAL\.env`, que git ignora, y no vuelve a preguntar.
3. Se abren dos ventanas negras (Servidor y Página web) y el navegador en <http://localhost:5173>. Sube un PDF y presiona **F** para analizar la página.
4. Para apagar: cierra las dos ventanas negras, o doble clic en **`DETENER.bat`**.

Para comprobar que todo arranca sin dejar nada abierto: `INICIAR.bat -Prueba`.

## En otra computadora (por ejemplo, para que La Victoria tome capturas)

Solo funciona en **Windows**. Se instala una sola vez:

- **Git**, **Python 3.12** (3.10 o 3.11 también sirven; con 3.13 o más nuevo la instalación suele fallar) y **Node.js 22 LTS**.
  Al instalar Python, marca "Add python.exe to PATH".

Después:

1. Descargar el proyecto: `git clone https://github.com/AdrianRosa21/tesis.git` (o `git pull` si ya lo tiene).
2. Abrir la carpeta `LOCALAQUIFUNCIONALOCAL` y hacer doble clic en **`INICIAR.bat`**. La primera vez instala todo sola (3 a 5 minutos, necesita internet).
3. Cuando pida la clave de OpenAI, pegar **su propia clave**. La clave de otra persona no se comparte (ni por chat ni por git: el `.env` nunca se sube). Cada página analizada se cobra a la cuenta de la clave que se pegue (~US$ 0.003).
4. Para probar: en `docs\demo\` hay 9 PDFs de ejemplo (examen de inglés, tabla, gráfica de barras, folleto con foto...). Súbelos desde la página y presiona **F**.

Las capturas de la tesis salen de la página abierta en `http://localhost:5173`; el panel de análisis muestra el motor (OpenAI) y los tiempos.

## Qué es distinto a producción

| | Producción (pod) | Este modo local |
|---|---|---|
| Lectura de la página | OpenAI + Ollama (detector y respaldo) | **Solo OpenAI** (`gpt-4.1-mini`) |
| Si OpenAI falla | Repite con Ollama v4 | Muestra un error |
| Voz en inglés | Piper del servidor | La del navegador |
| Privacidad | Igual que `hybrid`: cada página se envía a OpenAI | Igual: cada página se envía a OpenAI |
| Costo | ~US$ 0.003 por página | ~US$ 0.003 por página, a tu cuenta |

Consecuencia para la tesis: las pruebas hechas así miden **OpenAI**, no el pipeline completo con Ollama. Si las anotas como evidencia, dilo tal cual.

## Archivos

- `INICIAR.bat` / `iniciar.ps1`: levantan todo. `DETENER.bat`: lo apaga.
- `_backend.cmd` y `_frontend.cmd`: los lanzan cada uno en su ventana (no hace falta abrirlos).
- `.env.ejemplo`: plantilla de configuración. `.env` se crea solo y **nunca se sube a git**.

## Si algo falla

| Mensaje | Qué hacer |
|---|---|
| "El puerto 8000/5173 ya está en uso" | Doble clic en `DETENER.bat` y vuelve a iniciar. |
| En la página sale error y en la ventana del Servidor dice `HTTP 401 Incorrect API key` | La clave de OpenAI está mal. Edita `OPENAI_API_KEY=` en `LOCALAQUIFUNCIONALOCAL\.env` (o bórrala y `INICIAR.bat` la pide otra vez). |
| `HTTP 429` o `insufficient_quota` | La cuenta de OpenAI no tiene saldo o llegó a su límite. Revisa platform.openai.com → Billing. |
| "No encuentro Python 3.10, 3.11 o 3.12" | Instala Python 3.12 desde python.org (marca "Add python.exe to PATH"), cierra la ventana y vuelve a hacer doble clic en `INICIAR.bat`. |
| "No encuentro Node.js" | Instala Node.js 22 LTS desde nodejs.org y vuelve a iniciar. |
| En la ventana del Servidor aparece `GET /api/tts ... 405 Method Not Allowed` | No es un error: la página pregunta si hay voz en inglés del servidor y en este modo no la hay, así que lee con la voz del navegador. |
| Quiero cuidar el saldo | En `.env` pon `AURA_CLOUD_MAX_PAGES_PER_DAY=100` (o el número que quieras). |

Los logs del servidor se guardan en `LOCALAQUIFUNCIONALOCAL\logs\backend.log`.
