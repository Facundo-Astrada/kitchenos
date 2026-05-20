# setup-mcp.ps1 — Carga tokens de .env.local como variables de entorno de Windows
$envFile = "C:\Users\Equipo\Documents\kitchenos\.env.local"

if (-not (Test-Path $envFile)) {
    Write-Host "ERROR: No se encontro .env.local en $envFile" -ForegroundColor Red
    exit 1
}

Write-Host "Leyendo tokens de $envFile..." -ForegroundColor Cyan

$mcpTokens = @("SUPABASE_MANAGEMENT_TOKEN", "VERCEL_TOKEN", "GITHUB_PERSONAL_ACCESS_TOKEN")
$loaded = 0

Get-Content $envFile | Where-Object { $_ -match "^[A-Z_]+=" } | ForEach-Object {
    $parts = $_ -split "=", 2
    $name  = $parts[0].Trim()
    $value = $parts[1].Trim()

    if ($mcpTokens -contains $name) {
        [System.Environment]::SetEnvironmentVariable($name, $value, "User")
        Write-Host "  OK $name configurado" -ForegroundColor Green
        $loaded++
    }
}

Write-Host ""
Write-Host "$loaded token(s) cargados." -ForegroundColor Green
Write-Host "Cerrar y reabrir VS Code para que surtan efecto." -ForegroundColor Yellow
