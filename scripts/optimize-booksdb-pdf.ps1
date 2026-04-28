[CmdletBinding()]
param(
    [string]$SourceDir = "BooksDB",
    [string]$OutputDir = "BooksDB_optimized",
    [ValidateSet("screen", "ebook", "printer", "prepress", "default")]
    [string]$Preset = "ebook",
    [string]$CompatibilityLevel = "1.4",
    [int]$MinSavingsPercent = 0,
    [int]$MaxFiles = 0,
    [switch]$InPlace,
    [switch]$SkipExisting,
    [switch]$DryRun,
    [string]$ReportPath = "",
    [string]$StateFile = "",
    [switch]$SummaryOnly
)

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -Scope Global -ErrorAction SilentlyContinue) {
    $global:PSNativeCommandUseErrorActionPreference = $false
}

function Ensure-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        New-Item -ItemType Directory -Path $Path | Out-Null
    }
}

function Resolve-GhostscriptCommand {
    foreach ($name in @("gswin64c", "gswin32c", "gs")) {
        $cmd = Get-Command $name -ErrorAction SilentlyContinue
        if ($cmd) {
            return $cmd.Source
        }
    }
    $fallbacks = @(
        (Join-Path $env:LOCALAPPDATA "Programs\Ghostscript\bin\gswin64c.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Ghostscript\bin\gswin32c.exe"),
        "C:\Program Files\gs\bin\gswin64c.exe",
        "C:\Program Files\gs\bin\gswin32c.exe"
    )
    foreach ($p in $fallbacks) {
        if ($p -and (Test-Path -LiteralPath $p)) {
            return $p
        }
    }
    return $null
}

function Get-RelativePathSafe {
    param(
        [Parameter(Mandatory = $true)][string]$BasePath,
        [Parameter(Mandatory = $true)][string]$TargetPath
    )
    $base = (Resolve-Path -LiteralPath $BasePath).Path.TrimEnd("\", "/") + [IO.Path]::DirectorySeparatorChar
    $target = (Resolve-Path -LiteralPath $TargetPath).Path
    $baseUri = New-Object System.Uri($base)
    $targetUri = New-Object System.Uri($target)
    $relativeUri = $baseUri.MakeRelativeUri($targetUri)
    return [System.Uri]::UnescapeDataString($relativeUri.ToString()).Replace("/", [IO.Path]::DirectorySeparatorChar)
}

function New-ReportPaths {
    param([string]$ExplicitPath)
    $reportsDir = Join-Path (Get-Location).Path "reports"
    Ensure-Directory -Path $reportsDir
    if ($ExplicitPath) {
        $jsonPath = $ExplicitPath
        $csvPath = [IO.Path]::ChangeExtension($jsonPath, ".csv")
        return @{ Json = $jsonPath; Csv = $csvPath }
    }
    $stamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $base = Join-Path $reportsDir ("pdf-opt-report_" + $stamp)
    return @{
        Json = $base + ".json"
        Csv  = $base + ".csv"
    }
}

$root = (Get-Location).Path
$sourceResolved = Resolve-Path -LiteralPath $SourceDir -ErrorAction Stop
$sourcePath = $sourceResolved.Path

if (-not $DryRun) {
    $ghostscript = Resolve-GhostscriptCommand
    if (-not $ghostscript) {
        throw "Ghostscript tapylmady. Ilki gurnap, `gswin64c -version` ya-da `gs --version` barla."
    }
}

if ($InPlace) {
    $outputPath = $sourcePath
    $tempRoot = Join-Path $root ".tmp_pdf_opt"
    Ensure-Directory -Path $tempRoot
}
else {
    Ensure-Directory -Path $OutputDir
    $outputPath = (Resolve-Path -LiteralPath $OutputDir).Path
}

$processedSet = New-Object 'System.Collections.Generic.HashSet[string]'

if ($StateFile) {
    if (Test-Path -LiteralPath $StateFile) {
        Get-Content -LiteralPath $StateFile | ForEach-Object {
            if (-not [string]::IsNullOrWhiteSpace($_)) {
                [void]$processedSet.Add($_.Trim())
            }
        }
    }
    else {
        $stateDir = Split-Path -Path $StateFile -Parent
        if ($stateDir) { Ensure-Directory -Path $stateDir }
        New-Item -ItemType File -Path $StateFile | Out-Null
    }
}

$pdfFiles = Get-ChildItem -LiteralPath $sourcePath -Recurse -File -Filter "*.pdf" | Sort-Object FullName
if ($StateFile -and $processedSet.Count -gt 0) {
    $pdfFiles = $pdfFiles | Where-Object { -not $processedSet.Contains($_.FullName) }
}
if ($MaxFiles -gt 0) {
    $pdfFiles = $pdfFiles | Select-Object -First $MaxFiles
}

if (-not $pdfFiles -or $pdfFiles.Count -eq 0) {
    Write-Output "PDF tapylmady: $sourcePath"
    exit 0
}

$results = New-Object System.Collections.Generic.List[object]
$total = $pdfFiles.Count
$index = 0

foreach ($file in $pdfFiles) {
    $index += 1
    $relative = Get-RelativePathSafe -BasePath $sourcePath -TargetPath $file.FullName
    $target = Join-Path $outputPath $relative
    $targetDir = Split-Path -Path $target -Parent
    Ensure-Directory -Path $targetDir

    if ($SkipExisting -and -not $InPlace -and (Test-Path -LiteralPath $target)) {
        $results.Add([pscustomobject]@{
                status        = "skipped-existing"
                sourcePath    = $file.FullName
                outputPath    = $target
                originalBytes = [int64]$file.Length
                outputBytes   = [int64](Get-Item -LiteralPath $target).Length
                savingsBytes  = 0
                savingsPct    = 0
                durationMs    = 0
            })
        continue
    }

    if ($DryRun) {
        $results.Add([pscustomobject]@{
                status        = "dry-run"
                sourcePath    = $file.FullName
                outputPath    = $target
                originalBytes = [int64]$file.Length
                outputBytes   = [int64]$file.Length
                savingsBytes  = 0
                savingsPct    = 0
                durationMs    = 0
            })
        continue
    }

    if ($InPlace) {
        $target = Join-Path $tempRoot ($relative + ".optimized.pdf")
        $targetDir = Split-Path -Path $target -Parent
        Ensure-Directory -Path $targetDir
    }

    Write-Progress -Activity "PDF optimize" -Status "$index / $total" -PercentComplete (($index / $total) * 100)

    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Force
    }

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $gsArgs = @(
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=$CompatibilityLevel",
        "-dPDFSETTINGS=/$Preset",
        "-dDetectDuplicateImages=true",
        "-dCompressFonts=true",
        "-dSubsetFonts=true",
        "-dEmbedAllFonts=true",
        "-dNOPAUSE",
        "-dQUIET",
        "-dBATCH",
        "-sOutputFile=$target",
        $file.FullName
    )

    $exitCode = 0
    try {
        & $ghostscript @gsArgs *> $null
        $exitCode = $LASTEXITCODE
    }
    catch {
        $exitCode = if ($LASTEXITCODE) { $LASTEXITCODE } else { 1 }
    }
    $sw.Stop()

    if ($exitCode -ne 0 -or -not (Test-Path -LiteralPath $target)) {
        if (Test-Path -LiteralPath $target) {
            Remove-Item -LiteralPath $target -Force
        }
        $results.Add([pscustomobject]@{
                status        = "error"
                sourcePath    = $file.FullName
                outputPath    = $target
                originalBytes = [int64]$file.Length
                outputBytes   = 0
                savingsBytes  = 0
                savingsPct    = 0
                durationMs    = [int]$sw.ElapsedMilliseconds
            })
        if ($StateFile -and -not $processedSet.Contains($file.FullName)) {
            [void]$processedSet.Add($file.FullName)
            Add-Content -LiteralPath $StateFile -Value $file.FullName
        }
        continue
    }

    $originalBytes = [int64]$file.Length
    $optimizedBytes = [int64](Get-Item -LiteralPath $target).Length
    $savingsBytes = $originalBytes - $optimizedBytes
    $savingsPct = if ($originalBytes -gt 0) {
        [math]::Round(($savingsBytes / $originalBytes) * 100.0, 2)
    }
    else { 0 }
    $passesThreshold = $savingsPct -ge $MinSavingsPercent
    $isSmaller = $optimizedBytes -lt $originalBytes
    $keepOptimized = $isSmaller -and $passesThreshold
    $status = "compressed"
    $finalBytes = $optimizedBytes
    $finalPath = $target

    if (-not $keepOptimized) {
        if ($InPlace) {
            Remove-Item -LiteralPath $target -Force
            $status = if ($isSmaller) { "below-threshold-kept-original" } else { "kept-original" }
            $finalBytes = $originalBytes
            $finalPath = $file.FullName
        }
        else {
            Remove-Item -LiteralPath $target -Force
            Copy-Item -LiteralPath $file.FullName -Destination $target -Force
            $status = if ($isSmaller) { "below-threshold-copied-original" } else { "copied-original" }
            $finalBytes = $originalBytes
            $finalPath = $target
        }
    }
    elseif ($InPlace) {
        Move-Item -LiteralPath $target -Destination $file.FullName -Force
        $status = "replaced-in-place"
        $finalPath = $file.FullName
        $finalBytes = [int64](Get-Item -LiteralPath $file.FullName).Length
    }

    $results.Add([pscustomobject]@{
            status        = $status
            sourcePath    = $file.FullName
            outputPath    = $finalPath
            originalBytes = $originalBytes
            outputBytes   = $finalBytes
            savingsBytes  = $originalBytes - $finalBytes
            savingsPct    = if ($originalBytes -gt 0) { [math]::Round((($originalBytes - $finalBytes) / $originalBytes) * 100.0, 2) } else { 0 }
            durationMs    = [int]$sw.ElapsedMilliseconds
        })

    if ($StateFile) {
        [void]$processedSet.Add($file.FullName)
        Add-Content -LiteralPath $StateFile -Value $file.FullName
    }
}

Write-Progress -Activity "PDF optimize" -Completed

$origTotal = ($results | Measure-Object -Property originalBytes -Sum).Sum
$outTotal = ($results | Measure-Object -Property outputBytes -Sum).Sum
$savedTotal = $origTotal - $outTotal
$savedPct = if ($origTotal -gt 0) { [math]::Round(($savedTotal / $origTotal) * 100.0, 2) } else { 0 }

$summary = [pscustomobject]@{
    generatedAt        = (Get-Date).ToString("s")
    sourceDir          = $sourcePath
    outputDir          = $outputPath
    inPlace            = [bool]$InPlace
    dryRun             = [bool]$DryRun
    preset             = "/" + $Preset
    compatibilityLevel = $CompatibilityLevel
    minSavingsPercent  = $MinSavingsPercent
    totalFiles         = $results.Count
    originalBytesTotal = [int64]$origTotal
    outputBytesTotal   = [int64]$outTotal
    savedBytesTotal    = [int64]$savedTotal
    savedPercentTotal  = $savedPct
    statusCounts       = ($results | Group-Object status | ForEach-Object {
            [pscustomobject]@{
                status = $_.Name
                count  = $_.Count
            }
        })
}

$report = if ($SummaryOnly) {
    [pscustomobject]@{
        summary = $summary
    }
}
else {
    [pscustomobject]@{
        summary = $summary
        files   = $results
    }
}

$paths = New-ReportPaths -ExplicitPath $ReportPath
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $paths.Json -Encoding UTF8
$results | Export-Csv -LiteralPath $paths.Csv -NoTypeInformation -Encoding UTF8

Write-Output ("REPORT_JSON=" + $paths.Json)
Write-Output ("REPORT_CSV=" + $paths.Csv)
Write-Output ("FILES=" + $summary.totalFiles)
Write-Output ("SAVED_BYTES=" + $summary.savedBytesTotal)
Write-Output ("SAVED_PERCENT=" + $summary.savedPercentTotal)
