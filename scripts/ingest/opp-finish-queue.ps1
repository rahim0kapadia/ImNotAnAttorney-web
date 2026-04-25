# Orchestrator: download + load AZ/WA/OH sequentially, then downgrade compute XL to Medium.
# Call: .\opp-finish-queue.ps1
$ErrorActionPreference = 'Continue'

$scriptDir = 'C:\Users\email\projects\ImNotAnAttorney-web\scripts\ingest'
$loadScript = "$scriptDir\opp-psql-load.ps1"
$sevenZ = "$env:USERPROFILE\scoop\apps\7zip\current\7z.exe"
$psql = "$env:USERPROFILE\scoop\apps\postgresql\current\bin\psql.exe"

# DB connection for final count + tier downgrade. Use PG* env vars (C7 finding:
# password no longer in psql CLI / process listing).
$envFile = 'C:\Users\email\projects\ImNotAnAttorney-web\.env.local'
$dbUrlLine = (Get-Content $envFile | Where-Object { $_ -match '^SUPABASE_DB_URL=' }) -replace '^SUPABASE_DB_URL=', ''
$dbUri = [System.Uri]$dbUrlLine
$userInfoParts = $dbUri.UserInfo -split ':', 2
$env:PGHOST = $dbUri.Host
$env:PGPORT = '5432'
$env:PGUSER = [System.Uri]::UnescapeDataString($userInfoParts[0])
$env:PGPASSWORD = if ($userInfoParts.Count -gt 1) { [System.Uri]::UnescapeDataString($userInfoParts[1]) } else { '' }
$env:PGDATABASE = $dbUri.AbsolutePath.TrimStart('/')
$env:PGSSLMODE = 'require'

# stderr capture log (W9 finding) — append errors instead of swallowing.
$logRoot = 'C:\Users\email\AppData\Local\Temp\opp-load'
New-Item -Type Directory -Force -Path $logRoot | Out-Null
$orchLog = Join-Path $logRoot ("opp-finish-queue-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
"=== opp-finish-queue.ps1 started $(Get-Date -Format s) ===" | Out-File -FilePath $orchLog -Encoding utf8

# Read access token from either web or sibling env file
function Get-SupabaseToken {
  foreach ($p in @('C:\Users\email\projects\ImNotAnAttorney\.env.local',
                   'C:\Users\email\projects\ImNotAnAttorney-web\.env.local')) {
    if (-not (Test-Path $p)) { continue }
    $line = (Get-Content $p | Where-Object { $_ -match '^SUPABASE_ACCESS_TOKEN=' })
    if ($line) { return ($line -replace '^SUPABASE_ACCESS_TOKEN=', '').Trim() }
  }
  return $null
}

$states = @(
  @{ agency='az_statewide'; state='AZ'; url='https://stacks.stanford.edu/file/druid:yg821jf8611/yg821jf8611_az_statewide_2020_04_01.csv.zip' },
  @{ agency='wa_statewide'; state='WA'; url='https://stacks.stanford.edu/file/druid:yg821jf8611/yg821jf8611_wa_statewide_2020_04_01.csv.zip' },
  @{ agency='oh_statewide'; state='OH'; url='https://stacks.stanford.edu/file/druid:yg821jf8611/yg821jf8611_oh_statewide_2020_04_01.csv.zip' }
)
$druid = 'yg821jf8611'
$bulkDir = 'D:\inaa-bulk\openpolicing'
$workDir = 'C:\Users\email\AppData\Local\Temp\opp-load'

$started = Get-Date
Write-Output "=== OPP finish queue (AZ -> WA -> OH -> downgrade) starting $($started.ToString('s')) ==="

# Phase 1: parallel download of all 3 zips (network, not DB-contention)
Write-Output "==> Phase 1: parallel download of 3 zips"
$dlJobs = @()
foreach ($s in $states) {
  $zipDest = "$bulkDir\$($s.agency).csv.zip"
  if ((Test-Path $zipDest) -and (Get-Item $zipDest).Length -gt 0) {
    Write-Output "  $($s.agency): zip already present"
    continue
  }
  $url = $s.url
  $job = Start-Job -ScriptBlock {
    param($u, $dest)
    $wc = New-Object System.Net.WebClient
    $wc.DownloadFile($u, $dest)
    return (Get-Item $dest).Length
  } -ArgumentList $url, $zipDest
  $dlJobs += [pscustomobject]@{ Job=$job; Agency=$s.agency; Dest=$zipDest }
}
foreach ($j in $dlJobs) {
  $sz = Receive-Job -Job $j.Job -Wait -AutoRemoveJob
  Write-Output ("  $($j.Agency): {0:N1} MB" -f ($sz / 1MB))
}

# Phase 2: extract each
Write-Output "==> Phase 2: extract"
foreach ($s in $states) {
  $zipPath = "$bulkDir\$($s.agency).csv.zip"
  $extractDir = "$bulkDir\$($s.agency).d"
  $existing = Get-ChildItem $extractDir -Filter *.csv -ErrorAction SilentlyContinue
  if ($existing) {
    Write-Output ("  $($s.agency): extract cache hit ({0:N1} MB)" -f ($existing[0].Length / 1MB))
    continue
  }
  New-Item -Type Directory -Force -Path $extractDir | Out-Null
  & $sevenZ x $zipPath "-o$extractDir" -y > $null
  $csv = Get-ChildItem $extractDir -Filter *.csv | Select-Object -First 1
  Write-Output ("  $($s.agency): {0:N1} MB extracted" -f ($csv.Length / 1MB))
}

# Phase 3: sequential load (chunked psql) per state
Write-Output "==> Phase 3: sequential load"
$results = @()
foreach ($s in $states) {
  $extractDir = "$bulkDir\$($s.agency).d"
  $csv = Get-ChildItem $extractDir -Filter *.csv | Select-Object -First 1
  if (-not $csv) {
    Write-Output "  $($s.agency): NO CSV FOUND, skipping"
    $results += [pscustomobject]@{ State=$s.state; Rows=-1; DurationMin=0; Status='NO_CSV' }
    continue
  }
  Write-Output "--- loading $($s.agency) from $($csv.FullName) ---"
  Remove-Item "$workDir\part_*.csv" -Force -ErrorAction SilentlyContinue
  & $psql -c "DROP TABLE IF EXISTS _stage_police_stops_$($s.agency);" 2>&1 | Out-File -FilePath $orchLog -Append
  $env:OPP_SKIP_CHUNKING = $null
  $loadStart = Get-Date
  # Capture child powershell output (DuckDB + COPY progress + errors) to log
  # instead of letting it stream through the parent pipeline (W9 finding).
  & powershell -NoProfile -File $loadScript `
      -Agency $s.agency -StateCode $s.state -Druid $druid `
      -Csv $csv.FullName 2>&1 | Out-File -FilePath $orchLog -Append
  $loadDt = (Get-Date) - $loadStart
  if ($LASTEXITCODE -eq 0) {
    $countStr = & $psql -t -A -c "SELECT count(*) FROM police_stops WHERE agency = '$($s.agency)';"
    $count = [int64]($countStr.Trim())
    # Sanity: any statewide OPP dataset has at least 100k rows. If we got less, something dropped silently.
    if ($count -lt 100000) {
      Write-Output "  $($s.agency) SUSPICIOUS: only $count rows loaded (expected millions) - marking FAILED"
      $results += [pscustomobject]@{ State=$s.state; Rows=$count; DurationMin=[math]::Round($loadDt.TotalMinutes,1); Status='SUSPICIOUS_LOW_COUNT' }
    } else {
      Write-Output ("  $($s.agency) done: {0:N0} rows in {1:N1} min" -f $count, $loadDt.TotalMinutes)
      $results += [pscustomobject]@{ State=$s.state; Rows=$count; DurationMin=[math]::Round($loadDt.TotalMinutes,1); Status='OK' }
    }
  } else {
    Write-Output "  $($s.agency) FAILED (exit $LASTEXITCODE)"
    $results += [pscustomobject]@{ State=$s.state; Rows=-1; DurationMin=[math]::Round($loadDt.TotalMinutes,1); Status='FAILED' }
  }
}

# Phase 4: summary
Write-Output "==> Phase 4: summary"
$results | Format-Table -AutoSize

# Phase 5: downgrade compute XL to Medium (only if all states succeeded)
$allOk = ($results | Where-Object { $_.Status -ne 'OK' } | Measure-Object).Count -eq 0
if ($allOk) {
  Write-Output "==> Phase 5: downgrade compute XL -> Medium"
  $token = Get-SupabaseToken
  if (-not $token) {
    Write-Output "  WARN: no SUPABASE_ACCESS_TOKEN found, skipping downgrade - run manually"
  } else {
    $body = @{ addon_type='compute_instance'; addon_variant='ci_medium' } | ConvertTo-Json -Compress
    $headers = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }
    try {
      $resp = Invoke-WebRequest -Uri 'https://api.supabase.com/v1/projects/jxjbjmgdukwkoclydqdr/billing/addons' `
        -Method PATCH -Headers $headers -Body $body -UseBasicParsing
      Write-Output "  downgrade PATCH status: $($resp.StatusCode)"
      Start-Sleep -Seconds 5
      $cur = Invoke-RestMethod -Uri 'https://api.supabase.com/v1/projects/jxjbjmgdukwkoclydqdr/billing/addons' `
        -Method GET -Headers @{ Authorization = "Bearer $token" }
      $tier = $cur.selected_addons | Where-Object { $_.type -eq 'compute_instance' }
      Write-Output "  current tier: $($tier.variant.name) ($($tier.variant.id)) | RAM $($tier.variant.meta.memory_gb) GB"
    } catch {
      Write-Output "  downgrade FAILED: $_"
    }
  }
} else {
  Write-Output "==> Phase 5: SKIPPED (not all states succeeded - review failures, downgrade manually)"
}

$totalDt = (Get-Date) - $started
$totalMin = [math]::Round($totalDt.TotalMinutes, 1)
Write-Output "=== DONE total $totalMin min ==="