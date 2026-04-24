# Mega-orchestrator: load every OPP statewide dataset not already in police_stops.
# Skip-on-fail, retry-once-at-end, auto-upgrade tier if needed, auto-downgrade at end.
# Call: .\opp-load-all-remaining.ps1

$ErrorActionPreference = 'Continue'

$scriptDir = 'C:\Users\email\projects\ImNotAnAttorney-web\scripts\ingest'
$loadScript = "$scriptDir\opp-psql-load.ps1"
$sevenZ = "$env:USERPROFILE\scoop\apps\7zip\current\7z.exe"
$psql = "$env:USERPROFILE\scoop\apps\postgresql\current\bin\psql.exe"

$envFile = 'C:\Users\email\projects\ImNotAnAttorney-web\.env.local'
$dbUrlLine = (Get-Content $envFile | Where-Object { $_ -match '^SUPABASE_DB_URL=' }) -replace '^SUPABASE_DB_URL=', ''
$dbUri = [System.Uri]$dbUrlLine
$dbConnStr = "postgresql://$($dbUri.UserInfo)@$($dbUri.Host):5432$($dbUri.AbsolutePath)?sslmode=require"

function Get-SupabaseToken {
  foreach ($p in @('C:\Users\email\projects\ImNotAnAttorney\.env.local',
                   'C:\Users\email\projects\ImNotAnAttorney-web\.env.local')) {
    if (-not (Test-Path $p)) { continue }
    $line = (Get-Content $p | Where-Object { $_ -match '^SUPABASE_ACCESS_TOKEN=' })
    if ($line) { return ($line -replace '^SUPABASE_ACCESS_TOKEN=', '').Trim() }
  }
  return $null
}

function Get-ComputeTier($token) {
  $r = Invoke-RestMethod -Uri 'https://api.supabase.com/v1/projects/jxjbjmgdukwkoclydqdr/billing/addons' `
    -Method GET -Headers @{ Authorization = "Bearer $token" }
  $tier = $r.selected_addons | Where-Object { $_.type -eq 'compute_instance' }
  return $tier.variant.id
}

function Set-ComputeTier($token, $target) {
  $body = @{ addon_type='compute_instance'; addon_variant=$target } | ConvertTo-Json -Compress
  $headers = @{ Authorization = "Bearer $token"; 'Content-Type' = 'application/json' }
  Invoke-WebRequest -Uri 'https://api.supabase.com/v1/projects/jxjbjmgdukwkoclydqdr/billing/addons' `
    -Method PATCH -Headers $headers -Body $body -UseBasicParsing | Out-Null
}

# Full statewide dataset catalog (33 states, per openpolicing.stanford.edu/data/ scrape 2026-04-24)
$allStates = @(
  @{ agency='az_statewide'; state='AZ'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='ca_statewide'; state='CA'; druid='wb225bk3255'; release='2023_01_26' },
  @{ agency='co_statewide'; state='CO'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='ct_statewide'; state='CT'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='fl_statewide'; state='FL'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='ga_statewide'; state='GA'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='ia_statewide'; state='IA'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='il_statewide'; state='IL'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='ma_statewide'; state='MA'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='md_statewide'; state='MD'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='mi_statewide'; state='MI'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='mo_statewide'; state='MO'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='ms_statewide'; state='MS'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='mt_statewide'; state='MT'; druid='wb225bk3255'; release='2023_01_26' },
  @{ agency='nc_statewide'; state='NC'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='nd_statewide'; state='ND'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='ne_statewide'; state='NE'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='nh_statewide'; state='NH'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='nj_statewide'; state='NJ'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='nv_statewide'; state='NV'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='ny_statewide'; state='NY'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='oh_statewide'; state='OH'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='or_statewide'; state='OR'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='ri_statewide'; state='RI'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='sc_statewide'; state='SC'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='sd_statewide'; state='SD'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='tn_statewide'; state='TN'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='tx_statewide'; state='TX'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='va_statewide'; state='VA'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='vt_statewide'; state='VT'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='wa_statewide'; state='WA'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='wi_statewide'; state='WI'; druid='yg821jf8611'; release='2020_04_01' },
  @{ agency='wy_statewide'; state='WY'; druid='yg821jf8611'; release='2020_04_01' }
)

foreach ($s in $allStates) {
  $s.url = "https://stacks.stanford.edu/file/druid:$($s.druid)/$($s.druid)_$($s.agency)_$($s.release).csv.zip"
}

$bulkDir = 'D:\inaa-bulk\openpolicing'
$workDir = 'C:\Users\email\AppData\Local\Temp\opp-load'
$druidDefault = 'yg821jf8611'

# Which agencies are already loaded (>100k rows)?
Write-Output "=== Mega OPP orchestrator starting $(Get-Date -Format 's') ==="
$loaded = @{}
# Retry the "what's loaded" query up to 6 times. DB may be transitioning from a
# recent tier change. MUST succeed with sanity-check before proceeding; otherwise
# we risk re-loading already-present states and creating duplicates.
$attempts = 0
$maxAttempts = 6
$okDetected = $false
while ($attempts -lt $maxAttempts -and -not $okDetected) {
  $attempts++
  $loaded = @{}
  $queryOk = $true
  # Existence check per agency via LIMIT 1 - sub-second regardless of agency size.
  # Avoids full heap scan that stalled on 30M+ row agencies.
  foreach ($s in $allStates) {
    $n = & $psql $dbConnStr -t -A -c "SET enable_seqscan=off; SET statement_timeout='30s'; SELECT 1 FROM police_stops WHERE agency = '$($s.agency)' LIMIT 1;" 2>&1
    if ($LASTEXITCODE -ne 0) {
      Write-Output "  attempt ${attempts}: probe for $($s.agency) failed - $n"
      $queryOk = $false
      break
    }
    # Empty output = agency not loaded. Any non-empty non-SET line with '1' = loaded.
    $joined = if ($n) { ($n -join "`n") } else { '' }
    $lastLine = ($joined -split "`n" | Where-Object { $_ -and ($_ -notmatch '^SET$') } | Select-Object -Last 1)
    if ($lastLine -and ($lastLine -replace '\s','') -eq '1') {
      $loaded[$s.agency] = 1
    }
  }
  if ($queryOk) { $okDetected = $true; break }
  Write-Output "  attempt ${attempts} failed, waiting 30s..."
  Start-Sleep -Seconds 30
}
if (-not $okDetected) {
  Write-Output "`nABORT: could not detect loaded agencies after $maxAttempts attempts. DB state unknown. Fix manually."
  exit 1
}
Write-Output "Already loaded ($($loaded.Count) agencies):"
foreach ($k in $loaded.Keys | Sort-Object) {
  Write-Output ("  {0}: {1:N0}" -f $k, $loaded[$k])
}

$pending = $allStates | Where-Object { -not $loaded.ContainsKey($_.agency) }
Write-Output "`nPending ($($pending.Count) agencies):"
foreach ($s in $pending) { Write-Output "  $($s.agency)" }

if ($pending.Count -eq 0) {
  Write-Output "`nNothing to do. Exiting."
  return
}

# Ensure we're on XL tier for speed
# Tier changes have a cooldown ("still processing addon changes") right after
# a prior change. Poll-retry up to 5 min before giving up and running on whatever
# tier we're on.
$token = Get-SupabaseToken
if ($token) {
  $tier = Get-ComputeTier $token
  Write-Output "`nCurrent compute tier: $tier"
  if ($tier -ne 'ci_xlarge') {
    $upgradeAttempt = 0
    while ($upgradeAttempt -lt 10) {
      $upgradeAttempt++
      Write-Output "  Upgrade attempt $upgradeAttempt to ci_xlarge..."
      try {
        Set-ComputeTier $token 'ci_xlarge'
        Start-Sleep -Seconds 45  # Allow instance rebuild
        $newTier = Get-ComputeTier $token
        if ($newTier -eq 'ci_xlarge') {
          Write-Output "  Tier is now: $newTier"
          break
        }
        Write-Output "  Still on $newTier - waiting 60s for cooldown..."
        Start-Sleep -Seconds 60
      } catch {
        $msg = "$_"
        if ($msg -match 'still processing') {
          Write-Output "  Addon cooldown active, waiting 90s..."
          Start-Sleep -Seconds 90
        } else {
          Write-Output "  Upgrade error: $msg - waiting 60s..."
          Start-Sleep -Seconds 60
        }
      }
    }
  }
}

function Load-OneState($s) {
  $zipDest = "$bulkDir\$($s.agency).csv.zip"
  $extractDir = "$bulkDir\$($s.agency).d"

  # Download
  if ((Test-Path $zipDest) -and (Get-Item $zipDest).Length -gt 0) {
    Write-Output "  zip cache hit"
  } else {
    Write-Output "  downloading $($s.url)"
    try {
      $wc = New-Object System.Net.WebClient
      $wc.DownloadFile($s.url, $zipDest)
      $sz = (Get-Item $zipDest).Length
      Write-Output ("  downloaded {0:N1} MB" -f ($sz / 1MB))
    } catch {
      Write-Output "  DOWNLOAD FAILED: $_"
      return @{ State=$s.state; Rows=-1; Status='DOWNLOAD_FAILED'; Error="$_" }
    }
  }

  # Extract
  if (-not (Get-ChildItem $extractDir -Filter *.csv -ErrorAction SilentlyContinue)) {
    New-Item -Type Directory -Force -Path $extractDir | Out-Null
    & $sevenZ x $zipDest "-o$extractDir" -y > $null
    if ($LASTEXITCODE -ne 0) {
      return @{ State=$s.state; Rows=-1; Status='EXTRACT_FAILED' }
    }
  }
  $csv = Get-ChildItem $extractDir -Filter *.csv | Sort-Object Length -Descending | Select-Object -First 1
  if (-not $csv) {
    return @{ State=$s.state; Rows=-1; Status='NO_CSV' }
  }
  Write-Output ("  csv: {0:N1} MB" -f ($csv.Length / 1MB))

  # Load via opp-psql-load.ps1 (clean slate per state)
  Remove-Item "$workDir\part_*.csv" -Force -ErrorAction SilentlyContinue
  & $psql $dbConnStr -c "DROP TABLE IF EXISTS _stage_police_stops_$($s.agency);" 2>&1 | Out-Null
  $env:OPP_SKIP_CHUNKING = $null
  $loadStart = Get-Date
  & powershell -NoProfile -File $loadScript `
      -Agency $s.agency -StateCode $s.state -Druid $s.druid `
      -Csv $csv.FullName 2>&1
  $loadDt = (Get-Date) - $loadStart

  if ($LASTEXITCODE -ne 0) {
    return @{ State=$s.state; Rows=-1; Status='LOAD_FAILED'; DurationMin=[math]::Round($loadDt.TotalMinutes,1) }
  }

  $countStr = & $psql $dbConnStr -t -A -c "SELECT count(*) FROM police_stops WHERE agency = '$($s.agency)';"
  $count = [int64]($countStr.Trim())
  if ($count -lt 100000) {
    return @{ State=$s.state; Rows=$count; Status='LOW_COUNT'; DurationMin=[math]::Round($loadDt.TotalMinutes,1) }
  }

  # Clean up source to free D:
  Remove-Item $zipDest -Force -ErrorAction SilentlyContinue
  Remove-Item $extractDir -Recurse -Force -ErrorAction SilentlyContinue
  Remove-Item "$workDir\part_*.csv" -Force -ErrorAction SilentlyContinue

  return @{ State=$s.state; Rows=$count; Status='OK'; DurationMin=[math]::Round($loadDt.TotalMinutes,1) }
}

# Pass 1: each state once
$results = @()
$pass = 1
$queue = $pending
while ($queue.Count -gt 0) {
  $retry = @()
  Write-Output "`n======================================"
  Write-Output "Pass $pass ($($queue.Count) agencies)"
  Write-Output "======================================"
  foreach ($s in $queue) {
    Write-Output "`n--- $($s.agency) (pass $pass) ---"
    $r = Load-OneState $s
    $r['Pass'] = $pass
    $results += [pscustomobject]$r
    if ($r.Status -eq 'OK') {
      Write-Output ("  OK: {0:N0} rows in {1:N1} min" -f $r.Rows, $r.DurationMin)
    } else {
      Write-Output "  FAIL: $($r.Status)"
      if ($pass -eq 1) { $retry += $s }
    }
  }
  if ($pass -ge 2) { break }
  $queue = $retry
  $pass++
}

# Summary
Write-Output "`n=== FINAL SUMMARY ==="
$results | Format-Table -AutoSize
$okCount = ($results | Where-Object { $_.Status -eq 'OK' } | Measure-Object).Count
$failCount = ($results | Where-Object { $_.Status -ne 'OK' } | Measure-Object).Count
Write-Output "OK: $okCount  |  FAILED: $failCount"

# Downgrade if all OK
if ($failCount -eq 0 -and $token) {
  Write-Output "`nAll succeeded. Downgrading XL -> Medium..."
  Set-ComputeTier $token 'ci_medium'
  Start-Sleep -Seconds 10
  Write-Output "Final tier: $(Get-ComputeTier $token)"
} else {
  Write-Output "`nSKIPPED tier downgrade ($failCount failed). Review and downgrade manually."
}

Write-Output "`n=== DONE $(Get-Date -Format 's') ==="