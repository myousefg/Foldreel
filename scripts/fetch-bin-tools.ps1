# Downloads gallery-dl, yt-dlp, ffmpeg/ffprobe, and aria2c into bin/ - the
# folder electron-builder bundles straight into the installer (see
# package.json's win.extraResources) so a fresh install never needs to
# download anything itself. bin/ is gitignored (these are large upstream
# binaries, not something to version-control), so this script is the one
# repeatable way to populate it - run it once before your first `yarn dist`,
# and again whenever you want newer tool builds in the next release.
#
#   .\scripts\fetch-bin-tools.ps1
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
$bin = Join-Path $root 'bin'
$tmp = Join-Path $env:TEMP 'foldreel-fetch-bin-tools'
New-Item -ItemType Directory -Force -Path $bin | Out-Null
New-Item -ItemType Directory -Force -Path $tmp | Out-Null

Write-Host "== gallery-dl.exe (gdl-org builds) =="
Invoke-WebRequest -Uri "https://github.com/gdl-org/builds/releases/latest/download/gallery-dl_windows.exe" -OutFile "$bin\gallery-dl.exe"
Write-Host ("  {0:N1} MB" -f ((Get-Item "$bin\gallery-dl.exe").Length / 1MB))

Write-Host "== yt-dlp.exe =="
Invoke-WebRequest -Uri "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" -OutFile "$bin\yt-dlp.exe"
Write-Host ("  {0:N1} MB" -f ((Get-Item "$bin\yt-dlp.exe").Length / 1MB))

# Gyan's own site (gyan.dev) hosts the canonical "essentials" build but can be
# very slow to reach from some networks; the same build is mirrored on
# GitHub's release CDN under Gyan's own GyanD/codexffmpeg repo, which is
# consistently fast - prefer that mirror here.
Write-Host "== ffmpeg + ffprobe (Gyan essentials build, via GitHub mirror) =="
$ffRelease = Invoke-RestMethod -Uri "https://api.github.com/repos/GyanD/codexffmpeg/releases/latest" -Headers @{ "User-Agent" = "Foldreel" }
$ffAsset = $ffRelease.assets | Where-Object { $_.name -match "essentials_build\.zip$" } | Select-Object -First 1
if (-not $ffAsset) { throw "could not find an essentials_build.zip asset in GyanD/codexffmpeg's latest release" }
Invoke-WebRequest -Uri $ffAsset.browser_download_url -OutFile "$tmp\ffmpeg.zip"
Expand-Archive -Path "$tmp\ffmpeg.zip" -DestinationPath "$tmp\ffmpeg" -Force
$ffmpegExe  = Get-ChildItem -Path "$tmp\ffmpeg" -Recurse -Filter "ffmpeg.exe"  | Select-Object -First 1
$ffprobeExe = Get-ChildItem -Path "$tmp\ffmpeg" -Recurse -Filter "ffprobe.exe" | Select-Object -First 1
Copy-Item $ffmpegExe.FullName  "$bin\ffmpeg.exe"  -Force
Copy-Item $ffprobeExe.FullName "$bin\ffprobe.exe" -Force
Write-Host ("  ffmpeg.exe  {0:N1} MB" -f ((Get-Item "$bin\ffmpeg.exe").Length / 1MB))
Write-Host ("  ffprobe.exe {0:N1} MB" -f ((Get-Item "$bin\ffprobe.exe").Length / 1MB))

Write-Host "== aria2c.exe (resolve latest win-64bit release asset) =="
$rel = Invoke-RestMethod -Uri "https://api.github.com/repos/aria2/aria2/releases/latest" -Headers @{ "User-Agent" = "Foldreel" }
$asset = $rel.assets | Where-Object { $_.name -match "win-64bit.*\.zip$" } | Select-Object -First 1
if (-not $asset) { throw "no win-64bit aria2 asset found in aria2/aria2's latest release" }
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile "$tmp\aria2.zip"
Expand-Archive -Path "$tmp\aria2.zip" -DestinationPath "$tmp\aria2" -Force
$aria2Exe = Get-ChildItem -Path "$tmp\aria2" -Recurse -Filter "aria2c.exe" | Select-Object -First 1
Copy-Item $aria2Exe.FullName "$bin\aria2c.exe" -Force
Write-Host ("  aria2c.exe {0:N1} MB" -f ((Get-Item "$bin\aria2c.exe").Length / 1MB))

Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
Write-Host "== done - bin/ is ready for `yarn dist` =="
Get-ChildItem $bin | Select-Object Name, @{N='MB';E={[math]::Round($_.Length/1MB,1)}}
