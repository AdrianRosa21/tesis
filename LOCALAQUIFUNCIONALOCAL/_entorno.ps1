# Prepara el entorno de Python de AURA la primera vez (por ejemplo en otra computadora, donde
# fastapi_backend\venv no existe porque git no lo sube). Lo usa iniciar.ps1. Solo ASCII.

function Get-PythonVersion($exe, $extraArgs) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $out = & $exe @extraArgs -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
        if ($LASTEXITCODE -ne 0 -or -not $out) { return $null }
        return ("$out").Trim()
    } catch {
        return $null
    } finally {
        $ErrorActionPreference = $old
    }
}

# requirements.txt fija pydantic 2.7.4, que trae paquetes listos solo hasta Python 3.12.
function Find-AuraPython {
    $candidates = @(
        @('py', '-3.12'), @('py', '-3.11'), @('py', '-3.10'),
        @('python'), @('python3')
    )
    foreach ($candidate in $candidates) {
        if (-not (Get-Command $candidate[0] -ErrorAction SilentlyContinue)) { continue }
        $extra = @($candidate | Select-Object -Skip 1)
        $version = Get-PythonVersion $candidate[0] $extra
        if ($version -match '^3\.(10|11|12)$') { return , $candidate }
    }
    return $null
}

function Install-AuraRequirements($venvPython, $requirements) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $venvPython -m pip install --disable-pip-version-check -r $requirements
    $code = $LASTEXITCODE
    $ErrorActionPreference = $old
    if ($code -ne 0) { throw 'No se pudieron instalar las dependencias de Python (pip fallo). Revisa tu conexion a internet y vuelve a intentar.' }
}

function Ensure-AuraVenv($venvDir, $requirements) {
    $venvPython = Join-Path $venvDir 'Scripts\python.exe'
    $createdNow = $false

    if (-not (Test-Path $venvPython)) {
        $python = Find-AuraPython
        if (-not $python) {
            throw ("No encuentro Python 3.10, 3.11 o 3.12.`n" +
                "Instala Python 3.12 desde https://www.python.org/downloads/ (marca 'Add python.exe to PATH'),`n" +
                "cierra esta ventana y vuelve a hacer doble clic en INICIAR.bat.`n" +
                "Con Python 3.13 o mas nuevo la instalacion de las dependencias suele fallar.")
        }
        Write-Host 'Primera vez: creando el entorno de Python (tarda de 1 a 3 minutos)...' -ForegroundColor Yellow
        $old = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        & $python[0] @(@($python | Select-Object -Skip 1) + @('-m', 'venv', $venvDir))
        $code = $LASTEXITCODE
        $ErrorActionPreference = $old
        if ($code -ne 0 -or -not (Test-Path $venvPython)) { throw 'No se pudo crear el entorno de Python (venv).' }
        $createdNow = $true
    }

    # Si el entorno existe pero le faltan paquetes (instalacion a medias), se completan.
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & $venvPython -c "import fastapi, uvicorn, httpx, dotenv, pydantic" 2>$null
    $complete = ($LASTEXITCODE -eq 0)
    $ErrorActionPreference = $old

    if (-not $complete) {
        Write-Host 'Instalando las dependencias del servidor (solo esta vez)...' -ForegroundColor Yellow
        try {
            Install-AuraRequirements $venvPython $requirements
        } catch {
            if ($createdNow) { Remove-Item -LiteralPath $venvDir -Recurse -Force -ErrorAction SilentlyContinue }
            throw
        }
    }
}
