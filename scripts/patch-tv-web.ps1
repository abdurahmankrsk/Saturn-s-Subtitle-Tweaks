# Bakes SST into a jellyfin-web build so smart-TV apps (Samsung Tizen, LG webOS)
# ship with it. Those apps package their own copy of jellyfin-web, so the server's
# request middleware never gets a chance to inject the script tags.
#
# Run this against the jellyfin-web dist BEFORE packaging the .wgt / .ipk.
#
# Usage: .\scripts\patch-tv-web.ps1 -WebDist "C:\src\jellyfin-web\dist"
#        .\scripts\patch-tv-web.ps1 -WebDist ".\dist" -Revert

param(
    [Parameter(Mandatory = $true)]
    [string]$WebDist,

    [switch]$Revert
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$SourceJs = Join-Path $Root "Jellyfin.Plugin.SST\Web\sst.js"
$SourceCss = Join-Path $Root "Jellyfin.Plugin.SST\Web\sst.css"
$IndexPath = Join-Path $WebDist "index.html"

$BeginMarker = "<!-- SST:begin -->"
$EndMarker = "<!-- SST:end -->"

if (-not (Test-Path $IndexPath)) {
    throw "No index.html in $WebDist. Point -WebDist at a built jellyfin-web dist folder."
}

$html = Get-Content $IndexPath -Raw

# Always strip any previous block first so re-running is safe.
$pattern = [regex]::Escape($BeginMarker) + "(?s).*?" + [regex]::Escape($EndMarker) + "\r?\n?"
$stripped = [regex]::Replace($html, $pattern, "")

if ($Revert) {
    if ($stripped -eq $html) {
        Write-Host "No SST block found in $IndexPath - nothing to revert." -ForegroundColor Yellow
    } else {
        Set-Content $IndexPath $stripped -Encoding UTF8 -NoNewline
        Write-Host "Removed SST from $IndexPath" -ForegroundColor Green
    }

    foreach ($name in @("sst.js", "sst.css")) {
        $target = Join-Path $WebDist $name
        if (Test-Path $target) {
            Remove-Item $target -Force
            Write-Host "Removed $target" -ForegroundColor Green
        }
    }

    exit 0
}

foreach ($source in @($SourceJs, $SourceCss)) {
    if (-not (Test-Path $source)) {
        throw "Missing SST asset: $source"
    }
}

Copy-Item $SourceJs (Join-Path $WebDist "sst.js") -Force
Copy-Item $SourceCss (Join-Path $WebDist "sst.css") -Force
Write-Host "Copied sst.js and sst.css into $WebDist" -ForegroundColor Cyan

# Relative hrefs: the TV loads these from inside the app package, not from the server.
# Built by joining rather than with a here-string, which PowerShell 5.1 mis-parses
# in LF-only files like the rest of this repo.
$injection = (@(
    $BeginMarker,
    '    <link rel="stylesheet" href="sst.css" id="sst-client-style" />',
    '    <script src="sst.js" id="sst-script" defer></script>',
    $EndMarker,
    ""
) -join "`n")

$headIndex = $stripped.LastIndexOf("</head>", [System.StringComparison]::OrdinalIgnoreCase)
if ($headIndex -lt 0) {
    throw "No </head> in $IndexPath - cannot inject."
}

$patched = $stripped.Insert($headIndex, $injection)
Set-Content $IndexPath $patched -Encoding UTF8 -NoNewline

Write-Host "Injected SST into $IndexPath" -ForegroundColor Green
Write-Host ""
Write-Host "Next: package the TV app from this dist." -ForegroundColor Cyan
Write-Host "  Samsung: JELLYFIN_WEB_DIR=$WebDist yarn install  (in jellyfin-tizen), then tizen build-web / package" -ForegroundColor Gray
Write-Host "  LG:      copy this dist into jellyfin-webos, then npm run package" -ForegroundColor Gray
Write-Host ""
Write-Host "Re-run this script after every jellyfin-web upgrade." -ForegroundColor Yellow
