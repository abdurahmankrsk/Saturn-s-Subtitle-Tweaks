# Builds Jellyfin.Plugin.SST, packages the release zip, and updates manifest.json checksum.
# Usage: .\scripts\build-release.ps1 [-Version "1.1.0.0"]

param(
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$DllPath = Join-Path $Root "Jellyfin.Plugin.SST\bin\Release\net9.0\Jellyfin.Plugin.SST.dll"
$ZipPath = Join-Path $Root "Jellyfin.Plugin.SST.zip"
$ManifestPath = Join-Path $Root "manifest.json"

Write-Host "Building SST plugin..." -ForegroundColor Cyan
dotnet build (Join-Path $Root "Jellyfin.Plugin.SST.sln") -c Release

if (-not (Test-Path $DllPath)) {
    throw "Build output not found: $DllPath"
}

Write-Host "Creating $ZipPath..." -ForegroundColor Cyan
if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}
Compress-Archive -Path $DllPath -DestinationPath $ZipPath -Force

$checksum = (Get-FileHash $ZipPath -Algorithm MD5).Hash.ToLower()
Write-Host "MD5 checksum: $checksum" -ForegroundColor Green

if (-not $Version) {
    $propsFile = Join-Path $Root "Directory.Build.props"
    if (Test-Path $propsFile) {
        $match = Select-String -Path $propsFile -Pattern '<Version>([^<]+)</Version>' | Select-Object -First 1
        if ($match) {
            $Version = $match.Matches[0].Groups[1].Value
        }
    }
}

if ($Version -and (Test-Path $ManifestPath)) {
    $manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
    $plugin = $manifest[0]
    $entry = $plugin.versions | Where-Object { $_.version -eq $Version } | Select-Object -First 1
    if ($entry) {
        $entry.checksum = $checksum
        $entry.timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        $manifest | ConvertTo-Json -Depth 10 | Set-Content $ManifestPath -Encoding UTF8
        Write-Host "Updated manifest.json checksum for version $Version" -ForegroundColor Green
    } else {
        Write-Warning "Version $Version not found in manifest.json — update checksum manually."
    }
}

Write-Host "Done. Push Jellyfin.Plugin.SST.zip and manifest.json to GitHub before updating from the dashboard." -ForegroundColor Green
