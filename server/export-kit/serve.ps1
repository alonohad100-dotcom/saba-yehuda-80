# Saba Yehuda 80 - offline show player.
# Serves this folder on http://127.0.0.1:<port>/ and opens the show in Chrome or Edge.
# Needs nothing installed: Windows PowerShell 5.1 (built into Windows 10/11) is enough.
param([int]$Port = 47880, [string]$Page = 'show/', [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Split-Path -Parent $MyInvocation.MyCommand.Path))
if (-not $root.EndsWith('\')) { $root += '\' }

$mime = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'; '.webp' = 'image/webp'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'
  '.png' = 'image/png'; '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'; '.woff2' = 'font/woff2'; '.woff' = 'font/woff'
  '.mp4' = 'video/mp4'; '.m4a' = 'audio/mp4'; '.txt' = 'text/plain; charset=utf-8'
}

# first free port from $Port
$listener = $null
for ($p = $Port; $p -lt $Port + 30; $p++) {
  $l = New-Object System.Net.HttpListener
  $l.Prefixes.Add("http://127.0.0.1:$p/")
  try { $l.Start(); $listener = $l; $Port = $p; break } catch { $l.Close() }
}
if (-not $listener) { Write-Host 'Could not open a local port (47880-47909). Close other programs and try again.' -ForegroundColor Red; Read-Host 'Press Enter to close'; exit 1 }

$url = "http://127.0.0.1:$Port/$Page"
Write-Host ''
Write-Host '  Saba Yehuda 80 - the show is running' -ForegroundColor Yellow
Write-Host "  Show:      $url"
Write-Host "  Presenter: http://127.0.0.1:$Port/presenter/"
Write-Host '  Keep this window open during the show. Close it to stop.'
Write-Host ''

if (-not $NoBrowser) {
  $browsers = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe", "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
  ) | Where-Object { $_ -and (Test-Path $_) }
  if ($browsers) { Start-Process -FilePath $browsers[0] -ArgumentList @("--app=$url", '--start-maximized', '--autoplay-policy=no-user-gesture-required') }
  else { Start-Process $url }
}

$chunk = 4MB   # media is served in ranges of at most 4 MB so one long video never blocks the photos
$buf = New-Object byte[] 65536
while ($listener.IsListening) {
  try { $ctx = $listener.GetContext() } catch { break }
  $req = $ctx.Request; $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/').Replace('/', '\')
    if ($req.HttpMethod -ne 'GET' -and $req.HttpMethod -ne 'HEAD') {
      # the show records "rehearsed" and similar notes; an exported copy has nowhere to save them
      $b = [Text.Encoding]::UTF8.GetBytes('{"ok":true}'); $res.ContentType = 'application/json'; $res.ContentLength64 = $b.Length; $res.OutputStream.Write($b, 0, $b.Length); $res.Close(); continue
    }
    $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if (-not $file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) { $res.StatusCode = 403; $res.Close(); continue }
    if (Test-Path -LiteralPath $file -PathType Container) { $file = Join-Path $file 'index.html' }
    if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
      if ($rel -match '^api\\kv\\(.+)$') { $b = [Text.Encoding]::UTF8.GetBytes('{"key":"' + $Matches[1] + '","value":null}'); $res.ContentType = 'application/json'; $res.ContentLength64 = $b.Length; $res.OutputStream.Write($b, 0, $b.Length); $res.Close(); continue }
      if ($rel -match '^(api|media|assets)\\') { $res.StatusCode = 404; $res.Close(); continue }
      $file = Join-Path $root 'index.html'
    }
    $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
    $type = $mime[$ext]; if (-not $type) { $type = if ($rel -like 'api\*') { 'application/json; charset=utf-8' } else { 'application/octet-stream' } }
    $len = (Get-Item -LiteralPath $file).Length; $start = [int64]0; $end = [int64]($len - 1)
    $res.AddHeader('Accept-Ranges', 'bytes')
    $res.AddHeader('Cache-Control', $(if ($rel -like 'api\*' -or $ext -eq '.html') { 'no-cache' } else { 'max-age=86400' }))
    $range = $req.Headers['Range']
    if ($range -and $range -match '^bytes=(\d*)-(\d*)$') {
      if ($Matches[1] -ne '') { $start = [int64]$Matches[1]; if ($Matches[2] -ne '') { $end = [int64]$Matches[2] } }
      elseif ($Matches[2] -ne '') { $start = [Math]::Max(0, $len - [int64]$Matches[2]) }
      if ($end -ge $len) { $end = $len - 1 }
      if ($start -gt $end) { $res.StatusCode = 416; $res.AddHeader('Content-Range', "bytes */$len"); $res.Close(); continue }
      if ($end - $start + 1 -gt $chunk) { $end = $start + $chunk - 1 }
      $res.StatusCode = 206; $res.AddHeader('Content-Range', "bytes $start-$end/$len")
    }
    $res.ContentType = $type; $res.ContentLength64 = $end - $start + 1
    if ($req.HttpMethod -eq 'GET') {
      $fs = [IO.File]::Open($file, 'Open', 'Read', 'ReadWrite')
      try { [void]$fs.Seek($start, 'Begin'); $left = $end - $start + 1
        while ($left -gt 0) { $n = $fs.Read($buf, 0, [int][Math]::Min($buf.Length, $left)); if ($n -le 0) { break }; $res.OutputStream.Write($buf, 0, $n); $left -= $n } }
      finally { $fs.Close() }
    }
    $res.Close()
  } catch {
    # the browser cancelled a request (normal when skipping slides); keep serving
    try { $res.Abort() } catch { }
  }
}
