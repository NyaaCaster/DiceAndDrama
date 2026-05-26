<#
.SYNOPSIS
  Pull cloudsave:latest from the private registry and (re)start the container.
.NOTES
  Intended for the deploy host. Does not build; only refreshes the running
  container against the latest pushed image.
#>
$ErrorActionPreference = "Stop"

$PROJECT_NAME = "cloudsave"
$ScriptDir    = Split-Path -Parent $MyInvocation.MyCommand.Path
$ComposeFile  = Join-Path $ScriptDir "docker-compose.yml"

Push-Location $ScriptDir
try {
    Write-Host "Pulling latest image ..." -ForegroundColor Cyan
    docker compose -p $PROJECT_NAME -f $ComposeFile pull
    if ($LASTEXITCODE -ne 0) { throw "docker compose pull failed" }

    Write-Host "Bringing up $PROJECT_NAME ..." -ForegroundColor Cyan
    docker compose -p $PROJECT_NAME -f $ComposeFile up -d
    if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }

    docker image prune -f | Out-Null
    Write-Host "Done." -ForegroundColor Green
} finally {
    Pop-Location
}
