# Static export and optional S3 upload for the bifurcation diagram viewer.
# See deploy_guide.md and deploy.md.

param(
  [string]$S3Bucket = "baffledcat.com",
  [string]$S3Prefix = "bifurcation/",
  [switch]$SkipUpload
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Ensure-AwsAuth {
  aws sts get-caller-identity *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "AWS credentials not found. Running aws login..."
    aws login
    if ($LASTEXITCODE -ne 0) {
      throw "AWS authentication failed."
    }
    aws sts get-caller-identity *> $null
    if ($LASTEXITCODE -ne 0) {
      throw "AWS authentication still failed after aws login."
    }
  }
}

function Read-LatestManifest {
  param([string]$ExportRoot)
  $manifestPath = Join-Path $ExportRoot "latest.json"
  if (-not (Test-Path $manifestPath)) {
    throw "Missing Export/latest.json — export did not complete."
  }
  return Get-Content $manifestPath -Raw | ConvertFrom-Json
}

function Verify-RemoteVersion {
  param(
    [string]$PublicUrl,
    [string]$ExpectedVersion,
    [string]$GlobalName
  )

  $html = (Invoke-WebRequest -Uri $PublicUrl -UseBasicParsing).Content
  $needle = "self.$GlobalName = `"$ExpectedVersion`""
  if ($html -notlike "*$needle*") {
    throw "Remote index.html does not contain expected version stamp: $needle"
  }
}

Push-Location $Root
try {
  if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    Write-Host "Installing dev dependencies..."
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed." }
  }

  Write-Host "Running export-static.mjs..."
  node export-static.mjs
  if ($LASTEXITCODE -ne 0) { throw "export-static.mjs failed." }

  $manifest = Read-LatestManifest (Join-Path $Root "Export")
  $version = [string]$manifest.version
  $outDir = Join-Path $Root ($manifest.dir -replace "/", [IO.Path]::DirectorySeparatorChar)

  if (-not (Test-Path $outDir)) {
    throw "Export directory not found: $outDir"
  }

  Write-Host ""
  Write-Host "Export Version$version ready at $($manifest.dir)"

  if ($SkipUpload) {
    Write-Host "Skipping upload (-SkipUpload)."
    exit 0
  }

  Ensure-AwsAuth

  $prefix = $S3Prefix
  if (-not $prefix.EndsWith("/")) { $prefix += "/" }
  $s3Base = "s3://$S3Bucket/$prefix"

  Write-Host ""
  Write-Host "Uploading to $s3Base"

  aws s3 sync $outDir $s3Base `
    --delete `
    --exclude index.html `
    --exclude "*.json.gz" `
    --cache-control "public, max-age=31536000, immutable"
  if ($LASTEXITCODE -ne 0) { throw "S3 sync (assets) failed." }

  aws s3 sync $outDir $s3Base `
    --exclude "*" `
    --include "*.json.gz" `
    --content-type "application/gzip" `
    --cache-control "public, max-age=31536000, immutable"
  if ($LASTEXITCODE -ne 0) { throw "S3 sync (gzip data) failed." }

  aws s3 cp (Join-Path $outDir "index.html") "${s3Base}index.html" `
    --cache-control "public, max-age=60" `
    --content-type "text/html; charset=utf-8"
  if ($LASTEXITCODE -ne 0) { throw "S3 upload of index.html failed." }

  $publicUrl = if ($S3Bucket -match "\.") {
    "https://$S3Bucket/$prefix" + "index.html"
  } else {
    "https://$S3Bucket.s3.amazonaws.com/$prefix" + "index.html"
  }

  Write-Host "Verifying remote version at $publicUrl"
  Verify-RemoteVersion -PublicUrl $publicUrl -ExpectedVersion $version -GlobalName "__BIFURCATION_DIAGRAM_ASSET_VERSION__"

  Write-Host ""
  Write-Host "Upload complete. Version $version verified."
}
finally {
  Pop-Location
}
