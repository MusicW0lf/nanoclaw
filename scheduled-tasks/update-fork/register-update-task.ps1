$root = $PSScriptRoot
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$root\update-fork.ps1`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -Daily -At "12:00PM"
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 10) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName "NanoClaw-UpdateFork" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "NanoClaw-UpdateFork task registered."
