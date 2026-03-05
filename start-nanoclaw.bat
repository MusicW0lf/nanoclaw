@echo off
cd /d "%~dp0"
start "" /B "C:\Program Files\nodejs\node.exe" dist/index.js >> logs\nanoclaw.log 2>> logs\nanoclaw.error.log
echo NanoClaw started. Check logs\nanoclaw.log for output.
