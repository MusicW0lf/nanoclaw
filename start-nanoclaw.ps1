Set-Location "C:\Users\admin\Desktop\nanoclaw"
New-Item -ItemType Directory -Force -Path "logs" | Out-Null

$ts = { Get-Date -Format "yyyy-MM-dd HH:mm:ss" }

# Wait until Docker is ready (up to 5 minutes)
Add-Content "logs\nanoclaw.error.log" "$(& $ts) Waiting for Docker to be ready..."
$dockerReady = $false
for ($i = 0; $i -lt 60; $i++) {
    $result = & docker version 2>&1
    if ($LASTEXITCODE -eq 0) {
        $dockerReady = $true
        Add-Content "logs\nanoclaw.error.log" "$(& $ts) Docker is ready."
        break
    }
    Start-Sleep -Seconds 5
}

if (-not $dockerReady) {
    Add-Content "logs\nanoclaw.error.log" "$(& $ts) Docker did not start within 5 minutes. Starting anyway..."
}

# Restart loop: if nanoclaw exits for any reason, restart it
while ($true) {
    cmd /c "`"C:\Program Files\nodejs\node.exe`" dist/index.js >> logs\nanoclaw.log 2>> logs\nanoclaw.error.log"
    Add-Content "logs\nanoclaw.error.log" "$(& $ts) nanoclaw exited (code: $LASTEXITCODE), restarting in 15 seconds..."
    Start-Sleep -Seconds 15
}
