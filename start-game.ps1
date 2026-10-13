$ErrorActionPreference = 'Stop'
$gameRoot = $PSScriptRoot
$gameUrl = 'http://127.0.0.1:4173'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$gameNode = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $gameNode)) { throw 'Node.js not found. Install Node.js and run start-game.cmd again.' }
$gameReady = $false
try { $gameReady = (Invoke-WebRequest -Uri $gameUrl -UseBasicParsing -TimeoutSec 2).Content -match 'game/app.js' } catch {}
if (-not $gameReady) {
  Start-Process -FilePath $gameNode -ArgumentList ('"' + (Join-Path $gameRoot 'server.mjs') + '"') -WorkingDirectory $gameRoot -WindowStyle Hidden
  for ($gameAttempt = 0; $gameAttempt -lt 25; $gameAttempt++) {
    Start-Sleep -Milliseconds 200
    try { $gameReady = (Invoke-WebRequest -Uri $gameUrl -UseBasicParsing -TimeoutSec 1).Content -match 'game/app.js' } catch {}
    if ($gameReady) { break }
  }
}
if (-not $gameReady) { throw 'Could not start the game on port 4173. Check whether another application uses this port.' }
Start-Process $gameUrl
