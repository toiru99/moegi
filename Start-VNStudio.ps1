[CmdletBinding()]
param([switch]$NoOpen, [ValidatePattern('^$|^[a-z0-9_-]{1,64}$')][string]$ProjectId = '')

$ErrorActionPreference = 'Stop'
$taskRoot = $PSScriptRoot
$runtimeRoot = 'D:\VNStudio\runtime'
$sourceRoot = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'ChatGPT\REA'
$nodeExe = Join-Path $sourceRoot 'tools\node\node-v24.22.1-win-x64\node.exe'
$pythonExe = Join-Path $sourceRoot 'investigations\kinkoi\.venv\Scripts\python.exe'
$pnpmEntry = 'D:\VNStudio\toolchain\node_modules\pnpm\bin\pnpm.cjs'
$tarball = 'D:\VNStudio\store\deepseek-ai-dsh-client-ui-vn-studio-0.2.2-alpha.2-vn.15.tgz'
$env:DSH_HOME = 'D:\VNStudio\dsh-home'
$env:DSH_CLIENT_TITLE = 'VN Studio'
$env:PYTHONUTF8 = '1'
$env:PATH = (Split-Path -Parent $nodeExe) + ';' + $env:PATH
$env:PNPM_CONFIG_STORE_DIR = 'D:/.pnpm-store'
$env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN = 'false'
foreach ($required in @($nodeExe, $pythonExe, $pnpmEntry, $tarball)) {
    if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Missing development dependency: $required" }
}
New-Item -ItemType Directory -Force -Path $runtimeRoot | Out-Null

$storeListener = Get-NetTCPConnection -LocalPort 3091 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($storeListener) {
    $storeOwner = Get-CimInstance Win32_Process -Filter "ProcessId=$($storeListener.OwningProcess)"
    if ($storeOwner.CommandLine -notlike '*dev-tools/vn_store.py*' -and $storeOwner.CommandLine -notlike '*dev-tools\vn_store.py*') { throw 'Port 3091 is occupied by another application.' }
} else {
    Start-Process -FilePath $pythonExe -ArgumentList @('dev-tools/vn_store.py', '--tarball', $tarball, '--archive-directory', 'D:/VNStudio/store', '--legacy-version', '0.2.2-alpha.2', '--port', '3091') -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput "$runtimeRoot\store.out.log" -RedirectStandardError "$runtimeRoot\store.err.log" | Out-Null
}

$listener = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if ($owner.CommandLine -notlike '*apps/cli/src/bin.ts*') { throw 'Port 3080 is occupied by another application.' }
    $logFiles = @("$runtimeRoot\harness.out.log", 'D:\VNStudio\web-studio-3.log')
} else {
    Start-Process -FilePath $nodeExe -ArgumentList @($pnpmEntry, 'dsh', 'web', '--no-open', '--port', '3080') -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput "$runtimeRoot\harness.out.log" -RedirectStandardError "$runtimeRoot\harness.err.log" | Out-Null
    $logFiles = @("$runtimeRoot\harness.out.log")
}

$deadline = (Get-Date).AddSeconds(90)
$appUrl = $null
do {
    foreach ($logFile in $logFiles) {
        if (Test-Path -LiteralPath $logFile) {
            $logText = Get-Content -LiteralPath $logFile -Raw
            if (-not [string]::IsNullOrWhiteSpace($logText)) {
                $match = [regex]::Match($logText, 'http://127\.0\.0\.1:3080/\?token=[A-Za-z0-9_-]+')
                if ($match.Success) { $appUrl = $match.Value; break }
            }
        }
    }
    if (-not $appUrl) { Start-Sleep -Milliseconds 250 }
} while (-not $appUrl -and (Get-Date) -lt $deadline)
if (-not $appUrl) { throw 'The development application did not become ready; inspect the runtime logs.' }
if ($ProjectId -ne '') { $appUrl += '&project=' + [Uri]::EscapeDataString($ProjectId) }
if (-not $NoOpen) { Start-Process $appUrl | Out-Null }
Write-Output 'Novel studio is running on port 3080; the local plugin catalog is on port 3091.'
