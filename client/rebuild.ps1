<#
.SYNOPSIS
  Build the dicedrama-client image, tag it (latest + git short hash), start the container,
  and optionally push to the private registry.
.PARAMETER NoCache
  Pass --no-cache to docker compose build.
.PARAMETER NoPush
  Skip the docker push step (useful if the registry is unreachable).
.NOTES
  Required: a working docker daemon, the dicedrama-net external network
  (`docker network create dicedrama-net`), and a populated client/.env.
#>
param([switch]$NoCache, [switch]$NoPush)
$ErrorActionPreference = "Stop"

$REGISTRY     = "h.hony-wen.com:5000"
$IMAGE_NAME   = "dicedrama-client"
$PROJECT_NAME = "dicedrama-client"

$ScriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$ComposeFile = Join-Path $ScriptDir "docker-compose.yml"
$RepoRoot    = Split-Path -Parent $ScriptDir

Push-Location $ScriptDir
try {
    $GitShort = (& git -C $RepoRoot rev-parse --short HEAD).Trim()
    if (-not $GitShort) { throw "Failed to read git short hash from $RepoRoot" }

    Write-Host "Building $IMAGE_NAME @ $GitShort ..." -ForegroundColor Cyan

    if ($NoCache) {
        docker compose -p $PROJECT_NAME -f $ComposeFile build --no-cache
    } else {
        docker compose -p $PROJECT_NAME -f $ComposeFile build
    }
    if ($LASTEXITCODE -ne 0) { throw "docker compose build failed" }

    docker tag "${IMAGE_NAME}:latest" "${REGISTRY}/${IMAGE_NAME}:latest"
    docker tag "${IMAGE_NAME}:latest" "${REGISTRY}/${IMAGE_NAME}:${GitShort}"

    Write-Host "Bringing up $PROJECT_NAME ..." -ForegroundColor Cyan
    docker compose -p $PROJECT_NAME -f $ComposeFile up -d
    if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }

    if (-not $NoPush) {
        Write-Host "Pushing to ${REGISTRY} ..." -ForegroundColor Cyan
        docker push "${REGISTRY}/${IMAGE_NAME}:latest"
        if ($LASTEXITCODE -ne 0) { throw "docker push :latest failed" }
        docker push "${REGISTRY}/${IMAGE_NAME}:${GitShort}"
        if ($LASTEXITCODE -ne 0) { throw "docker push :$GitShort failed" }
    } else {
        Write-Host "Skipped registry push (--NoPush)." -ForegroundColor Yellow
    }

    $dangling = docker images -f "dangling=true" -q
    if ($dangling) { docker rmi -f $dangling | Out-Null }

    Write-Host "Done. ${IMAGE_NAME}:${GitShort} ready." -ForegroundColor Green
} finally {
    Pop-Location
}
