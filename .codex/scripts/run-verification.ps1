[CmdletBinding()]
param(
    [ValidateSet('respin', 'ugc', 'all')]
    [string]$Profile = 'all',
    [string]$LogDirectory
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if ([string]::IsNullOrWhiteSpace($LogDirectory)) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $LogDirectory = Join-Path ([System.IO.Path]::GetTempPath()) "trendmonitor-verification\$stamp"
}
[System.IO.Directory]::CreateDirectory($LogDirectory) | Out-Null

function New-Step {
    param([string]$Name, [string]$File, [string[]]$Arguments)
    [pscustomobject]@{ Name = $Name; File = $File; Arguments = $Arguments }
}

$respinSteps = @(
    New-Step 'Respin typecheck' 'pnpm' @('-C', 'respin', 'typecheck')
    New-Step 'Respin lint' 'pnpm' @('-C', 'respin', 'lint')
    New-Step 'Respin tests' 'pnpm' @('-C', 'respin', 'test')
    New-Step 'Respin build' 'pnpm' @('-C', 'respin', 'build')
    New-Step 'Respin migration drift' 'pnpm' @('-C', 'respin', 'db:check')
)
$ugcSteps = @(
    New-Step 'UGC schemas parse' 'node' @('-e', "['docs/initial.past/schemas/rubric-v1.json','docs/initial.past/schemas/events-v1.json','docs/initial.past/schemas/mechanisms-v1.json'].forEach(f=>JSON.parse(require('fs').readFileSync(f,'utf8')))")
    New-Step 'UGC solution build' 'dotnet' @('build', 'UgcIntelligence.slnx')
    New-Step 'UGC architecture tests' 'dotnet' @('test', 'tests/Architecture')
    New-Step 'UGC intelligence tests' 'uv' @('run', '--with', 'pytest', 'pytest', 'tests/Architecture')
    New-Step 'UGC intelligence lint' 'uv' @('run', '--with', 'ruff', 'ruff', 'check', 'src/IntelligencePlane', 'tests/Architecture')
    New-Step 'UGC frontend typecheck' 'npm' @('--prefix', 'src/Frontend', 'run', 'typecheck')
    New-Step 'UGC frontend tests' 'npm' @('--prefix', 'src/Frontend', 'test')
)

$steps = switch ($Profile) {
    'respin' { $respinSteps }
    'ugc' { $ugcSteps }
    'all' { @($respinSteps) + @($ugcSteps) }
}

$failed = New-Object System.Collections.Generic.List[string]
Push-Location $projectRoot
try {
    foreach ($step in $steps) {
        $safeName = ($step.Name -replace '[^A-Za-z0-9._-]+', '-').Trim('-').ToLowerInvariant()
        $logPath = Join-Path $LogDirectory "$safeName.log"
        $started = Get-Date
        $lines = @()
        try {
            $lines = @(& $step.File @($step.Arguments) 2>&1 | ForEach-Object { $_.ToString() })
            $exitCode = $LASTEXITCODE
        } catch {
            $lines += $_.Exception.ToString()
            $exitCode = 1
        }
        [System.IO.File]::WriteAllLines($logPath, [string[]]$lines)
        $duration = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)
        if ($exitCode -eq 0) {
            Write-Host "PASS  $($step.Name)  ${duration}s"
        } else {
            $failed.Add($step.Name)
            Write-Host "FAIL  $($step.Name)  exit=$exitCode  ${duration}s" -ForegroundColor Red
            Write-Host "      log: $logPath"
            $lines | Select-Object -Last 80 | ForEach-Object { Write-Host "      $_" }
        }
    }
} finally {
    Pop-Location
}

Write-Host "Full logs: $LogDirectory"
if ($Profile -in @('respin', 'all')) {
    Write-Warning 'Live migration apply and TEST_DATABASE_URL concurrency evidence are separate, environment-authorized checks. This script does not start Docker, read secrets, or set database credentials.'
}
if ($failed.Count -gt 0) {
    Write-Host "Verification failed: $($failed -join ', ')" -ForegroundColor Red
    exit 1
}
Write-Host "Verification profile '$Profile' passed."
