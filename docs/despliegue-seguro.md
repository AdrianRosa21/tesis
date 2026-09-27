# Despliegue seguro de AURA

Esta guía prepara el POD, el proxy privado de Vercel y la validación final sin volver a exponer claves en el navegador.

## 0. Revocar la clave antigua de Gemini

Los scripts legados contenían una clave de Google/Gemini en texto plano. Fueron eliminados, pero la clave debe considerarse comprometida.

1. Abre [Google AI Studio - API Keys](https://aistudio.google.com/api-keys).
2. Identifica la clave antigua del proyecto usado por AURA.
3. Revisa primero el uso y la facturación por actividad desconocida.
4. Elimina o revoca esa clave. AURA ya no usa Gemini, así que no hace falta reemplazarla.

Google recomienda generar una clave nueva, actualizar los servicios, verificar y después eliminar la comprometida cuando todavía sea necesaria. En este caso los archivos dependientes fueron retirados, por lo que puede revocarse directamente.

## 1. Generar la nueva clave interna de AURA

Desde la raíz del repositorio ejecuta:

```powershell
npm run security:key
```

El comando imprime una cadena aleatoria fuerte. Cópiala temporalmente a un administrador de contraseñas. No la guardes en Git, capturas, chats, archivos `VITE_*` ni documentación.

Esta misma cadena se configura con dos nombres distintos:

- En el POD: `API_KEY`
- En Vercel: `AURA_API_KEY`

## 2. Configurar el POD de RunPod

Con el POD detenido:

1. Abre RunPod y selecciona el POD o la plantilla que lo crea.
2. Abre la edición de plantilla o **Set overrides**.
3. En **Environment Variables**, añade `API_KEY` con la nueva cadena.
4. Conserva `OLLAMA_BASE_URL`, `OLLAMA_MODEL` y `MAX_CACHE_ENTRIES` con sus valores actuales.
5. Guarda la configuración.

También puede actualizarse con `runpodctl` usando `--env`, pero la actualización reemplaza el conjunto de variables; incluye todas las variables existentes y no solamente `API_KEY`.

Todavía no hace falta encender el túnel. Primero actualiza el código del backend a esta versión. Cuando llegue la validación final, inicia Ollama, FastAPI y después el túnel.

## 3. Configurar Vercel

En el proyecto de AURA:

1. Entra en **Settings > Environment Variables**.
2. Crea `AURA_BACKEND_URL` con `https://api.aura4blinds.online`.
3. Crea `AURA_API_KEY` con la misma cadena configurada como `API_KEY` en el POD.
4. Marca `AURA_API_KEY` como sensible cuando Vercel ofrezca esa opción.
5. Aplica ambas variables a **Production**. Añádelas también a **Preview** solo si las previews deben usar el POD real.
6. Elimina `VITE_API_KEY` y `VITE_API_URL` de Production y Preview.
7. Guarda los cambios.

Vercel aplica cambios de variables solamente a despliegues nuevos. Después de guardar hay que abrir **Deployments**, elegir el despliegue más reciente y usar **Redeploy**, o desplegar el nuevo commit conectado a Git.

La función `api/describe-image.js` recibe la página desde el navegador, añade `AURA_API_KEY` dentro de Vercel y llama al POD. El bundle de React nunca recibe esa clave.

## 4. Orden de despliegue

1. Actualiza el código del POD.
2. Configura `API_KEY` y reinicia FastAPI.
3. Inicia Ollama y comprueba localmente que el modelo configurado está disponible.
4. Enciende el túnel.
5. Comprueba:

```text
https://api.aura4blinds.online/api/health
https://api.aura4blinds.online/api/ready
```

6. Despliega o redespliega Vercel con las variables privadas nuevas.
7. Abre AURA, carga un PDF de prueba y confirma que la lectura termina con “Análisis completado”.

## 5. Ejecutar el corpus dos veces sin reutilizar caché

Ejecuta el comando siguiente. Si no existe `AURA_API_KEY` en el entorno y se llama directamente al backend, el runner solicitará la clave con entrada oculta:

```powershell
python scripts/run_fidelity_corpus.py `
  --corpus "C:\Users\adria\Downloads\AURA_corpus_pruebas_PDF" `
  --case F `
  --runs 2 `
  --fresh-runs
```

No declares la clave dentro del comando porque la terminal puede guardar historial. Usa la solicitud oculta del runner, una variable de entorno de sesión o un administrador de secretos.

## 6. Protección adicional pendiente

El proxy evita exponer la clave del POD, pero `/api/describe-image` sigue siendo una ruta pública del producto. Antes de un lanzamiento abierto configura rate limiting o reglas de firewall en Vercel para limitar solicitudes por IP y bloquear abuso. No dependas de CORS ni del encabezado `Origin` como autenticación.

Referencias oficiales:

- [Variables de entorno de Vercel](https://vercel.com/docs/environment-variables)
- [Rotación de secretos en Vercel](https://vercel.com/docs/environment-variables/rotating-secrets)
- [Configuración de proyectos Vercel](https://vercel.com/docs/project-configuration/project-settings)
- [Documentación de RunPod](https://docs.runpod.io/)
- [Administración segura de claves de Gemini](https://ai.google.dev/gemini-api/docs/api-key)
