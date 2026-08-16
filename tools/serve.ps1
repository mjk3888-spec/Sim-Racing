param(
  [string]$Root = 'D:\Projects\Sim-Racing',
  [int]$Port = 8777,
  [switch]$BlockSW   # 404 sw.js so a service worker cannot cache stale files mid-test
)

$ErrorActionPreference = 'Stop'
# An orchestrator that assigns its own port passes it via $env:PORT; that wins.
if ($env:PORT) { $Port = [int]$env:PORT }
$mime = @{
  '.html'='text/html; charset=utf-8'; '.js'='text/javascript; charset=utf-8';
  '.css'='text/css; charset=utf-8';   '.json'='application/json; charset=utf-8';
  '.svg'='image/svg+xml';             '.png'='image/png';
  '.ico'='image/x-icon';              '.txt'='text/plain; charset=utf-8';
  '.md'='text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Output "SERVING $Root on http://localhost:$Port/ (BlockSW=$BlockSW)"

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    $rel = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
    if ($rel -eq '') { $rel = 'index.html' }

    # POST /__save/<name> writes a base64 body to tools/out/. Used to generate
    # icon PNGs from the logo SVG in a real browser canvas, which avoids adding
    # an image-processing dependency just to resize a logo.
    if ($rel.StartsWith('__save/') -and $req.HttpMethod -eq 'POST') {
      $name = [System.IO.Path]::GetFileName($rel.Substring(7))
      $reader = New-Object System.IO.StreamReader($req.InputStream)
      $b64 = $reader.ReadToEnd()
      $reader.Close()
      $outDir = Join-Path $PSScriptRoot 'out'
      if (-not (Test-Path $outDir)) { New-Item -ItemType Directory $outDir | Out-Null }
      [System.IO.File]::WriteAllBytes((Join-Path $outDir $name), [System.Convert]::FromBase64String($b64))
      $res.AddHeader('Access-Control-Allow-Origin','*')
      $res.StatusCode = 200
      $ok = [System.Text.Encoding]::UTF8.GetBytes('saved ' + $name)
      $res.OutputStream.Write($ok, 0, $ok.Length)
      $res.Close()
      continue
    }
    if ($req.HttpMethod -eq 'OPTIONS') {
      $res.AddHeader('Access-Control-Allow-Origin','*')
      $res.AddHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS')
      $res.StatusCode = 200; $res.Close(); continue
    }

    if ($rel -eq '__quit') {
      $res.StatusCode = 200
      $res.Close()
      $listener.Stop()
      break
    }

    # /__harness/* serves the verification scripts from the scratchpad, so the
    # test harness never has to be committed into the repo being tested.
    if ($rel.StartsWith('__harness/')) {
      $base = $PSScriptRoot
      $path = Join-Path $base ($rel.Substring(10))
    } else {
      $base = $Root
      $path = Join-Path $Root $rel
    }
    $full = [System.IO.Path]::GetFullPath($path)
    $rootFull = [System.IO.Path]::GetFullPath($base)

    $blocked = $BlockSW -and ($rel -eq 'sw.js')

    if ($blocked -or (-not $full.StartsWith($rootFull)) -or (-not (Test-Path $full -PathType Leaf))) {
      $res.StatusCode = 404
      $body = [System.Text.Encoding]::UTF8.GetBytes('not found')
      $res.OutputStream.Write($body, 0, $body.Length)
      $res.Close()
      continue
    }

    $ext = [System.IO.Path]::GetExtension($full).ToLower()
    $ct = $mime[$ext]
    if (-not $ct) { $ct = 'application/octet-stream' }

    $bytes = [System.IO.File]::ReadAllBytes($full)
    $res.ContentType = $ct
    $res.AddHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
    $res.StatusCode = 200
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.Close()
  } catch {
    try { $res.StatusCode = 500; $res.Close() } catch {}
  }
}
$listener.Close()
Write-Output 'STOPPED'
