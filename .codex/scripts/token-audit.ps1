[CmdletBinding()]
param([string]$ActivePlan)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Measure-Group {
    param([string]$Label, [string[]]$Paths)
    $files = New-Object System.Collections.Generic.List[System.IO.FileInfo]
    foreach ($path in $Paths) {
        $resolved = Join-Path $projectRoot $path
        if (Test-Path -LiteralPath $resolved -PathType Leaf) {
            $files.Add((Get-Item -LiteralPath $resolved))
        } elseif (Test-Path -LiteralPath $resolved -PathType Container) {
            Get-ChildItem -LiteralPath $resolved -File -Recurse |
                Where-Object { $_.Name -eq 'SKILL.md' } |
                ForEach-Object { $files.Add($_) }
        }
    }
    $bytes = ($files | Measure-Object -Property Length -Sum).Sum
    if ($null -eq $bytes) { $bytes = 0 }
    [pscustomobject]@{
        Group = $Label
        Files = $files.Count
        Bytes = [int64]$bytes
        ApproxTokens = [int64][math]::Ceiling($bytes / 4.0)
    }
}

$groups = @(
    Measure-Group 'Always-on instructions' @('AGENTS.md', 'CLAUDE.md')
    Measure-Group 'Codebase index' @('.codebase-map\SUMMARY.md')
    Measure-Group 'Codex overlay' @('.codex\codex-overlay.md')
    Measure-Group 'Generated skill wrappers' @('.agents\skills')
)

if (-not [string]::IsNullOrWhiteSpace($ActivePlan)) {
    $fullPlan = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $ActivePlan))
    $plansRoot = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'docs\plans'))
    if (-not $fullPlan.StartsWith($plansRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw 'ActivePlan must be a literal file under docs/plans.'
    }
    if (-not (Test-Path -LiteralPath $fullPlan -PathType Leaf)) { throw "Active plan not found: $ActivePlan" }
    $relative = $fullPlan.Substring($projectRoot.Length + 1)
    $groups += Measure-Group 'Active plan' @($relative)
}

$groups | Format-Table -AutoSize
$totalBytes = ($groups | Measure-Object -Property Bytes -Sum).Sum
$totalApprox = [int64][math]::Ceiling($totalBytes / 4.0)
Write-Host "Approximate total: $totalApprox tokens ($totalBytes bytes)."
Write-Warning 'This is a static bytes/4 context proxy, not tokenizer output, API billing telemetry, or proof that every file is loaded. It reads only the explicit safe paths above and never scans env, secret, credential, token, or PEM locations.'
