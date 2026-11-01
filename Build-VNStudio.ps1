[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$sourceRoot = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'ChatGPT\REA'
$nodeExe = Join-Path $sourceRoot 'tools\node\node-v24.22.1-win-x64\node.exe'
$pnpmEntry = 'D:\VNStudio\toolchain\node_modules\pnpm\bin\pnpm.cjs'
$env:PATH = (Split-Path -Parent $nodeExe) + ';' + $env:PATH
$env:PNPM_CONFIG_STORE_DIR = 'D:/VNStudio/pnpm-store'
$env:PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN = 'false'
$env:DSH_CLIENT_TITLE = 'VN Studio'
Push-Location $PSScriptRoot
try {
    & $nodeExe $pnpmEntry run build
    if ($LASTEXITCODE -ne 0) { throw "VN Studio build failed: $LASTEXITCODE" }
} finally { Pop-Location }
