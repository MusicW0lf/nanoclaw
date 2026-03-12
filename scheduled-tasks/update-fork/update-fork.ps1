Set-Location "$PSScriptRoot\..\.."
New-Item -ItemType Directory -Force -Path "logs" | Out-Null

$log = "logs\update-fork.log"
$changelogFile = "logs\update-changelog.md"
function Log($msg) { Add-Content $log "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg" }

# Read values from .env
function Get-EnvValue($key) {
    $envPath = Join-Path (Get-Location) ".env"
    if (-not (Test-Path $envPath)) { return "" }
    $line = Get-Content $envPath | Where-Object { $_ -match "^$key=" } | Select-Object -First 1
    if ($line) { return $line.Substring($key.Length + 1).Trim().Trim('"').Trim("'") }
    return ""
}

function Send-Telegram($token, $chatId, $text) {
    $body = @{ chat_id = $chatId; text = $text } | ConvertTo-Json
    try {
        Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/sendMessage" `
            -Method Post -ContentType "application/json" -Body $body | Out-Null
    } catch {
        Log "Telegram notify failed: $_"
    }
}

Log "Starting fork update..."

# Commit any uncommitted changes first
$status = & git status --porcelain 2>&1
if ($status) {
    Log "Uncommitted changes detected, committing..."
    $out = & git add -A 2>&1
    Log "git add: $out"
    $out = & git commit -m "chore: auto-commit local changes before upstream merge" 2>&1
    Log "git commit: $out"
    if ($LASTEXITCODE -ne 0) { Log "ERROR: commit failed. Aborting."; exit 1 }
}

# Record HEAD before merge to compute what changed
$headBefore = & git rev-parse HEAD 2>&1

$out = & git fetch upstream 2>&1
Log "fetch upstream: $out"

# Check if there's anything new
$newCommits = & git log --oneline HEAD..upstream/main 2>&1
if (-not $newCommits) {
    Log "Already up to date. Nothing to merge."
    exit 0
}

$out = & git merge upstream/main --no-edit 2>&1
Log "merge: $out"
if ($LASTEXITCODE -ne 0) { Log "ERROR: merge failed. Aborting."; exit 1 }

$out = & git push origin main 2>&1
Log "push: $out"
if ($LASTEXITCODE -ne 0) { Log "ERROR: push failed."; exit 1 }

# Build changelog entry
$date = Get-Date -Format "yyyy-MM-dd HH:mm"
$commits = & git log --oneline "$headBefore..HEAD" 2>&1 | Where-Object { $_ -notmatch "^chore: auto-commit" -and $_ -notmatch "^Merge remote-tracking" }
$changedFiles = & git diff --name-only $headBefore HEAD 2>&1

$entry = @"

## $date

### Commits
$($commits -join "`n")

### Changed files
$($changedFiles -join "`n")

---
"@

Add-Content $changelogFile $entry
Log "Changelog written."

# Send Telegram notification
$token = Get-EnvValue "TELEGRAM_BOT_TOKEN"
$chatId = "978271600"

if ($token -and $commits) {
    $commitList = ($commits | Select-Object -First 10) -join "`n"
    $msg = "NanoClaw updated ($date)`n`nNew upstream commits:`n$commitList"
    if ($commits.Count -gt 10) { $msg += "`n...and $($commits.Count - 10) more" }
    Send-Telegram $token $chatId $msg
    Log "Telegram notification sent."
}

Log "Done."
