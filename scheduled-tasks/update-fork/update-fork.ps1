Set-Location "$PSScriptRoot\..\.."
New-Item -ItemType Directory -Force -Path "logs" | Out-Null

$log = "logs\update-fork.log"
function Log($msg) { Add-Content $log "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" }

Log "Starting fork update..."

$out = & git fetch upstream 2>&1
Log "fetch upstream: $out"

$out = & git merge upstream/main --no-edit 2>&1
Log "merge: $out"
if ($LASTEXITCODE -ne 0) { Log "ERROR: merge failed. Aborting."; exit 1 }

$out = & git push origin main 2>&1
Log "push: $out"
if ($LASTEXITCODE -ne 0) { Log "ERROR: push failed."; exit 1 }

Log "Done."
