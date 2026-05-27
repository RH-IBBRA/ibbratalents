$port = if ($env:PORT) { [int]$env:PORT } else { 8771 }
$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$port/"

$mime = @{
  '.html'='text/html; charset=utf-8';
  '.css'='text/css; charset=utf-8';
  '.js'='application/javascript; charset=utf-8';
  '.json'='application/json; charset=utf-8';
  '.svg'='image/svg+xml';
  '.png'='image/png';
  '.jpg'='image/jpeg';
  '.ico'='image/x-icon';
  '.mp4'='video/mp4';
  '.webm'='video/webm';
}

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  $path = $req.Url.AbsolutePath
  if ($path -eq '/') { $path = '/index.html' }
  $file = Join-Path $root $path.TrimStart('/').Replace('/', [System.IO.Path]::DirectorySeparatorChar)
  if (Test-Path $file -PathType Leaf) {
    $ext = [System.IO.Path]::GetExtension($file).ToLower()
    if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] }
    $bytes = [System.IO.File]::ReadAllBytes($file)
    $res.ContentLength64 = $bytes.Length
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $res.StatusCode = 404
    $buf = [System.Text.Encoding]::UTF8.GetBytes("404: $path")
    $res.OutputStream.Write($buf, 0, $buf.Length)
  }
  $res.Close()
}
