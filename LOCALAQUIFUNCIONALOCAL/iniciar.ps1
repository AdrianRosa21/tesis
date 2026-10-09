# Levanta AURA completa en tu PC: servidor FastAPI (con OpenAI) + pagina web (Vite).
# Uso normal: doble clic en INICIAR.bat.   Autoprueba: INICIAR.bat -Prueba  (arranca, comprueba y apaga)
param(
    [switch]$Prueba
)

$ErrorActionPreference = 'Stop'
$Here = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $Here
$EnvFile = Join-Path $Here '.env'
$Template = Join-Path $Here '.env.ejemplo'
$BackPort = 8000
$FrontPort = 5173
$BackUrl = "http://127.0.0.1:$BackPort"
$FrontUrl = "http://localhost:$FrontPort"

function Fail($msg) {
    Write-Host ''
    Write-Host "ERROR: $msg" -ForegroundColor Red
    exit 1
}

function Read-DotEnv($path) {
    $map = [ordered]@{}
    foreach ($line in (Get-Content -LiteralPath $path -Encoding UTF8)) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
            $name = $Matches[1]
            $value = $Matches[2]
            if ($value -match '^"(.*)"$') { $value = $Matches[1] }
            elseif ($value -match "^'(.*)'$") { $value = $Matches[1] }
            $map[$name] = $value
        }
    }
    return $map
}

function Set-DotEnvValue($path, $name, $value) {
    $lines = @(Get-Content -LiteralPath $path -Encoding UTF8)
    $found = $false
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match "^\s*$name\s*=") {
            $lines[$i] = "$name=$value"
            $found = $true
            break
        }
    }
    if (-not $found) { $lines += "$name=$value" }
    [System.IO.File]::WriteAllLines($path, [string[]]$lines)
}

function Wait-Url($url, $seconds, $headers = @{}) {
    $limit = (Get-Date).AddSeconds($seconds)
    while ((Get-Date) -lt $limit) {
        try {
            $r = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -eq 200) { return $r }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    return $null
}

function Stop-Tree($proc) {
    if ($proc -and -not $proc.HasExited) {
        & taskkill.exe /PID $proc.Id /T /F | Out-Null
    }
}

Write-Host ''
Write-Host '=== AURA local (sin pod) con OpenAI ===' -ForegroundColor Cyan

# --- 1. Requisitos -------------------------------------------------------------
. (Join-Path $Here '_entorno.ps1')

# Python: en una computadora nueva el entorno (fastapi_backend\venv) no existe; se crea solo la primera vez.
try {
    Ensure-AuraVenv (Join-Path $Root 'fastapi_backend\venv') (Join-Path $Root 'fastapi_backend\requirements.txt')
} catch {
    Fail $_.Exception.Message
}

if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    Fail 'No encuentro Node.js (npm). Instala Node.js 22 LTS desde https://nodejs.org, cierra esta ventana y vuelve a hacer doble clic en INICIAR.bat.'
}
if (-not (Test-Path (Join-Path $Root 'node_modules\vite'))) {
    Write-Host 'Falta node_modules: instalando dependencias de la pagina (solo esta vez, tarda 1 o 2 minutos)...' -ForegroundColor Yellow
    Push-Location $Root
    & npm.cmd install
    $npmCode = $LASTEXITCODE
    Pop-Location
    if ($npmCode -ne 0) { Fail 'npm install fallo. Revisa tu conexion a internet y vuelve a intentar.' }
}

# --- 2. Configuracion (.env de esta carpeta) ----------------------------------
$sessionOpenAiKey = $env:OPENAI_API_KEY   # por si ya la tienes en el entorno de Windows
if (-not (Test-Path $EnvFile)) {
    Copy-Item -LiteralPath $Template -Destination $EnvFile
    Write-Host 'Creado .env a partir de .env.ejemplo.'
}
$cfg = Read-DotEnv $EnvFile

if (-not $cfg['API_KEY']) {
    $localKey = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
    Set-DotEnvValue $EnvFile 'API_KEY' $localKey
    $cfg = Read-DotEnv $EnvFile
}

$openAiKey = $cfg['OPENAI_API_KEY']
if (-not $openAiKey -and $sessionOpenAiKey) {
    $openAiKey = $sessionOpenAiKey
    Write-Host 'Usando OPENAI_API_KEY del entorno de Windows (no se guarda en el .env).'
}
if (-not $openAiKey) {
    if ($Prueba) { Fail 'En modo -Prueba hace falta OPENAI_API_KEY (en el .env o en el entorno).' }
    Write-Host ''
    Write-Host 'Falta tu clave de OpenAI (empieza con sk-). Se pide solo esta vez y se guarda en LOCALAQUIFUNCIONALOCAL\.env' -ForegroundColor Yellow
    Write-Host 'No se muestra al escribir. Pegala (clic derecho o Ctrl+V) y pulsa Enter.'
    for ($try = 1; $try -le 3 -and -not $openAiKey; $try++) {
        $secure = Read-Host 'OPENAI_API_KEY' -AsSecureString
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()
        if ($plain -like 'sk-*' -and $plain.Length -ge 20) {
            $openAiKey = $plain
            Write-Host ("Clave recibida ({0} caracteres)." -f $plain.Length) -ForegroundColor Green
        } else {
            Write-Host 'Esa clave no parece valida (debe empezar con sk-). Intenta de nuevo.' -ForegroundColor Red
        }
    }
    if (-not $openAiKey) { Fail 'No se recibio una clave valida de OpenAI.' }
    Set-DotEnvValue $EnvFile 'OPENAI_API_KEY' $openAiKey
    $cfg = Read-DotEnv $EnvFile
}

# Variables que hereda el servidor (tienen prioridad sobre el .env de la raiz del proyecto).
foreach ($name in $cfg.Keys) {
    if ($cfg[$name]) { [Environment]::SetEnvironmentVariable($name, $cfg[$name], 'Process') }
}
$env:OPENAI_API_KEY = $openAiKey
if (-not $env:LOG_FILE_PATH) { $env:LOG_FILE_PATH = Join-Path $Here 'logs\backend.log' }
# La pagina (modo desarrollo) apunta a este servidor y manda la clave LOCAL (no la de OpenAI).
$env:VITE_API_URL = $BackUrl
$env:VITE_API_KEY = $cfg['API_KEY']

# --- 3. Puertos libres -------------------------------------------------------------
foreach ($port in @($BackPort, $FrontPort)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        Fail "El puerto $port ya esta en uso (quiza AURA ya esta abierta). Ejecuta DETENER.bat y vuelve a intentar."
    }
}

# --- 4. Servidor -----------------------------------------------------------------------
$style = if ($Prueba) { 'Hidden' } else { 'Normal' }
Write-Host 'Arrancando el servidor...'
$back = Start-Process -FilePath (Join-Path $Here '_backend.cmd') -WorkingDirectory $Root -WindowStyle $style -PassThru
$ready = Wait-Url "$BackUrl/api/ready" 40
if (-not $ready) {
    Stop-Tree $back
    Fail 'El servidor no respondio en 40 s. Corre _backend.cmd a mano para ver el error.'
}
$info = $ready.Content | ConvertFrom-Json
Write-Host ("Servidor listo: pipeline={0}, proveedor={1}, modelo={2}" -f $info.pipeline, $info.provider, $info.model) -ForegroundColor Green
if ($info.pipeline -ne 'hybrid' -or $info.provider -ne 'openai') {
    Stop-Tree $back
    Fail 'El servidor no quedo en modo hybrid + openai. Revisa LOCALAQUIFUNCIONALOCAL\.env'
}

# --- 5. Pagina web -----------------------------------------------------------------------
Write-Host 'Arrancando la pagina web...'
$front = Start-Process -FilePath (Join-Path $Here '_frontend.cmd') -WorkingDirectory $Root -WindowStyle $style -PassThru
$page = Wait-Url $FrontUrl 40
if (-not $page) {
    Stop-Tree $front
    Stop-Tree $back
    Fail 'La pagina no respondio en 40 s. Corre _frontend.cmd a mano para ver el error.'
}
Write-Host "Pagina lista: $FrontUrl" -ForegroundColor Green

# --- 6. Autoprueba o abrir el navegador -----------------------------------------------
if ($Prueba) {
    $ok = $true
    $good = Wait-Url "$BackUrl/api/tts/status" 5 @{ 'x-api-key' = $cfg['API_KEY'] }
    if ($good) { Write-Host 'OK: el servidor acepta la clave local.' -ForegroundColor Green } else { $ok = $false; Write-Host 'FALLO: el servidor no acepto la clave local.' -ForegroundColor Red }
    try {
        Invoke-WebRequest -Uri "$BackUrl/api/tts/status" -Headers @{ 'x-api-key' = 'incorrecta' } -UseBasicParsing | Out-Null
        $ok = $false
        Write-Host 'FALLO: el servidor acepto una clave incorrecta.' -ForegroundColor Red
    } catch {
        Write-Host 'OK: el servidor rechaza una clave incorrecta (401).' -ForegroundColor Green
    }
    Stop-Tree $front
    Stop-Tree $back
    if ($ok) { Write-Host 'PRUEBA OK. Todo se apago.' -ForegroundColor Cyan; exit 0 } else { exit 1 }
}

Start-Process $FrontUrl
Write-Host ''
Write-Host 'Listo. Se abrio AURA en tu navegador.' -ForegroundColor Cyan
Write-Host ' - Sube un PDF y presiona F para analizar la pagina.'
Write-Host ' - Para apagar todo: cierra las dos ventanas negras (Servidor y Pagina web) o ejecuta DETENER.bat.'
