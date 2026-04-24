# work-mem: XL tier verified (work-mem-log.js CHECKED xlarge=16GB ceiling=1024MB work_mem=256MB)
# Chunked OPP load via DuckDB coerce + psql \copy.
# Usage: .\opp-psql-load.ps1 -Agency nc_statewide -StateCode NC -Druid yg821jf8611 -Csv D:\path\to.csv
# 4 chunks × ~5M rows = network-drop-safe (each chunk its own txn).

param(
  [Parameter(Mandatory=$true)][string]$Agency,
  [Parameter(Mandatory=$true)][string]$StateCode,
  [Parameter(Mandatory=$true)][string]$Druid,
  [Parameter(Mandatory=$true)][string]$Csv,
  [int]$ChunkSize = 5000000,
  [string]$WorkDir = "C:\Users\email\AppData\Local\Temp\opp-load"
)

$ErrorActionPreference = 'Stop'

# Whitelist regex defense (C5 security finding). Agency/StateCode/Druid flow into
# DuckDB SQL literals AND Postgres table-name templates; Csv flows into psql \copy
# FROM '<path>'. Reject anything that isn't a safe slug before any interpolation.
if ($Agency -notmatch '^[a-z0-9_]+$')    { throw "Agency '$Agency' rejected (must match ^[a-z0-9_]+`$)" }
if ($StateCode -notmatch '^[A-Z]{2}$')   { throw "StateCode '$StateCode' rejected (must match ^[A-Z]{2}`$)" }
if ($Druid -notmatch '^[a-z0-9]+$')      { throw "Druid '$Druid' rejected (must match ^[a-z0-9]+`$)" }
if (-not (Test-Path -LiteralPath $Csv -PathType Leaf)) { throw "Csv path '$Csv' does not exist" }
$Csv = (Resolve-Path -LiteralPath $Csv).Path  # canonicalize, blocks traversal tricks
if ($Csv -match "[`r`n']") { throw "Csv path '$Csv' rejected (newline or quote)" }
$duckdb = "$env:USERPROFILE\scoop\shims\duckdb.exe"
$psql   = "$env:USERPROFILE\scoop\apps\postgresql\current\bin\psql.exe"
# Skip DuckDB re-chunking if chunk files already exist + look valid
$SkipChunking = $env:OPP_SKIP_CHUNKING -eq '1'

# Load DB URL from .env.local, swap to session-mode port 5432
$envFile = 'C:\Users\email\projects\ImNotAnAttorney-web\.env.local'
$dbUrlLine = (Get-Content $envFile | Where-Object { $_ -match '^SUPABASE_DB_URL=' }) -replace '^SUPABASE_DB_URL=', ''
$dbUri = [System.Uri]$dbUrlLine
$dbConnStr = "postgresql://$($dbUri.UserInfo)@$($dbUri.Host):5432$($dbUri.AbsolutePath)?sslmode=require"

New-Item -Type Directory -Force -Path $WorkDir | Out-Null
$stage = "_stage_police_stops_$Agency"

# Session settings applied per psql call. work_mem 256MB safe under XL (16GB RAM) ceiling 1GB.
# maintenance_work_mem left at Supabase default (Supabase auto-sets per tier).
function Run-Psql([string]$sql, [string]$label) {
  Write-Output "==> $label"
  $t0 = Get-Date
  $null = & $psql $dbConnStr -v ON_ERROR_STOP=1 -q `
    -c "SET statement_timeout='3h'" `
    -c "SET synchronous_commit=off" `
    -c "SET work_mem='256MB'" `
    -c "SET tcp_keepalives_idle=60" `
    -c "SET tcp_keepalives_interval=10" `
    -c "SET tcp_keepalives_count=6" `
    -c $sql
  if ($LASTEXITCODE -ne 0) { throw "psql failed on: $label" }
  $dt = (Get-Date) - $t0
  Write-Output ("    ok ({0:N1}s)" -f $dt.TotalSeconds)
}

function Copy-Chunk([string]$partPath, [int]$idx) {
  Write-Output "==> COPY chunk $idx from $partPath"
  $t0 = Get-Date
  $cmd = "\copy $stage FROM '$($partPath -replace '\\', '/')' WITH (FORMAT csv, HEADER true, NULL '')"
  $null = & $psql $dbConnStr -v ON_ERROR_STOP=1 -q `
    -c "SET statement_timeout='3h'" `
    -c "SET synchronous_commit=off" `
    -c "SET tcp_keepalives_idle=60" `
    -c "SET tcp_keepalives_interval=10" `
    -c "SET tcp_keepalives_count=6" `
    -c $cmd
  if ($LASTEXITCODE -ne 0) { throw "psql \copy failed on chunk $idx" }
  $dt = (Get-Date) - $t0
  Write-Output ("    chunk $idx done ({0:N1}s)" -f $dt.TotalSeconds)
}

Write-Output "=== OPP LOAD — agency=$Agency state=$StateCode chunks of $ChunkSize ==="
Write-Output "  CSV: $Csv"
Write-Output "  work: $WorkDir"

# ── 1. DuckDB materialize + chunk in one session ───────────────────────────
if ($SkipChunking -and (Test-Path "$WorkDir\part_1.csv") -and (Test-Path "$WorkDir\part_4.csv")) {
  Write-Output "==> DuckDB SKIPPED (OPP_SKIP_CHUNKING=1 and chunks exist)"
  Get-ChildItem "$WorkDir\part_*.csv" | ForEach-Object {
    Write-Output ("  {0}: {1:N1} MB" -f $_.Name, ($_.Length / 1MB))
  }
} else {
Write-Output "==> DuckDB materialize + chunk"
$t0 = Get-Date
$csvFwd = $Csv -replace '\\', '/'
$workFwd = $WorkDir -replace '\\', '/'
$sql = @"
-- all_varchar=true: read every column as VARCHAR. TRY_CAST in SELECT safely
-- handles 'NA', empty, or malformed values → NULL. This is bulletproof against
-- DuckDB auto-type-inference mismatching the actual CSV content.
-- OPP schema varies by state (NC missing officer_age; FL missing search_person/vehicle/contraband_*).
-- ALTER ADD COLUMN IF NOT EXISTS fills gaps with NULL so one SELECT template handles any state.
CREATE OR REPLACE MACRO nz(x) AS NULLIF(NULLIF(trim(x), 'NA'), '');
CREATE OR REPLACE TABLE opp_raw AS SELECT * FROM read_csv_auto('$csvFwd', sample_size=-1, all_varchar=true);
-- Ensure every column our SELECT references exists — missing cols become NULL.
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS date VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS time VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS subject_race VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS subject_sex VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS subject_age VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS officer_id_hash VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS officer_race VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS officer_sex VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS type VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS violation VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS arrest_made VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS citation_issued VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS warning_issued VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS outcome VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS search_conducted VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS search_person VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS search_vehicle VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS contraband_found VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS contraband_drugs VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS contraband_weapons VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS frisk_performed VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS reason_for_stop VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS reason_for_search VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS county_name VARCHAR;
ALTER TABLE opp_raw ADD COLUMN IF NOT EXISTS raw_row_number VARCHAR;
CREATE OR REPLACE TABLE opp AS
SELECT
  '$Agency'::VARCHAR                       AS agency,
  '$StateCode'::VARCHAR                    AS state_code,
  NULL::VARCHAR                            AS city,
  TRY_CAST(nz(date) AS DATE)               AS stop_date,
  TRY_CAST(nz(time) AS TIME)               AS stop_time,
  nz(subject_race)                         AS subject_race,
  CASE WHEN upper(nz(subject_sex)) LIKE 'M%' THEN 'M'
       WHEN upper(nz(subject_sex)) LIKE 'F%' THEN 'F' END AS subject_sex,
  TRY_CAST(nz(subject_age) AS SMALLINT)    AS subject_age,
  nz(officer_id_hash)                      AS officer_id,
  nz(officer_race)                         AS officer_race,
  CASE WHEN upper(nz(officer_sex)) LIKE 'M%' THEN 'M'
       WHEN upper(nz(officer_sex)) LIKE 'F%' THEN 'F' END AS officer_sex,
  nz(type)                                 AS stop_type,
  nz(violation)                            AS violation,
  CASE WHEN lower(nz(arrest_made)) IN ('true','t','1') THEN TRUE
       WHEN lower(nz(arrest_made)) IN ('false','f','0') THEN FALSE END AS arrest_made,
  CASE WHEN lower(nz(citation_issued)) IN ('true','t','1') THEN TRUE
       WHEN lower(nz(citation_issued)) IN ('false','f','0') THEN FALSE END AS citation_issued,
  CASE WHEN lower(nz(warning_issued)) IN ('true','t','1') THEN TRUE
       WHEN lower(nz(warning_issued)) IN ('false','f','0') THEN FALSE END AS warning_issued,
  nz(outcome)                              AS outcome,
  CASE WHEN lower(nz(search_conducted)) IN ('true','t','1') THEN TRUE
       WHEN lower(nz(search_conducted)) IN ('false','f','0') THEN FALSE END AS search_conducted,
  CASE WHEN lower(nz(search_person)) IN ('true','t','1') THEN TRUE
       WHEN lower(nz(search_person)) IN ('false','f','0') THEN FALSE END AS search_person,
  CASE WHEN lower(nz(search_vehicle)) IN ('true','t','1') THEN TRUE
       WHEN lower(nz(search_vehicle)) IN ('false','f','0') THEN FALSE END AS search_vehicle,
  CASE WHEN lower(nz(contraband_found)) IN ('true','t','1') THEN TRUE
       WHEN lower(nz(contraband_found)) IN ('false','f','0') THEN FALSE END AS contraband_found,
  CASE WHEN lower(nz(contraband_drugs)) IN ('true','t','1') THEN TRUE
       WHEN lower(nz(contraband_drugs)) IN ('false','f','0') THEN FALSE END AS contraband_drugs,
  CASE WHEN lower(nz(contraband_weapons)) IN ('true','t','1') THEN TRUE
       WHEN lower(nz(contraband_weapons)) IN ('false','f','0') THEN FALSE END AS contraband_weapons,
  CASE WHEN lower(nz(frisk_performed)) IN ('true','t','1') THEN TRUE
       WHEN lower(nz(frisk_performed)) IN ('false','f','0') THEN FALSE END AS frisk_performed,
  nz(reason_for_stop)                      AS reason_for_stop,
  nz(reason_for_search)                    AS reason_for_search,
  NULL::DOUBLE                             AS location_lat,
  NULL::DOUBLE                             AS location_lng,
  NULL::VARCHAR                            AS district,
  nz(county_name)                          AS county_name,
  '$Druid'::VARCHAR                        AS source_druid,
  TRY_CAST(raw_row_number AS BIGINT)       AS raw_row_number
FROM opp_raw;
DROP TABLE opp_raw;

COPY (SELECT * EXCLUDE (raw_row_number) FROM opp WHERE raw_row_number <= $ChunkSize)
  TO '$workFwd/part_1.csv' (FORMAT CSV, HEADER true);
COPY (SELECT * EXCLUDE (raw_row_number) FROM opp WHERE raw_row_number > $ChunkSize AND raw_row_number <= $($ChunkSize * 2))
  TO '$workFwd/part_2.csv' (FORMAT CSV, HEADER true);
COPY (SELECT * EXCLUDE (raw_row_number) FROM opp WHERE raw_row_number > $($ChunkSize * 2) AND raw_row_number <= $($ChunkSize * 3))
  TO '$workFwd/part_3.csv' (FORMAT CSV, HEADER true);
COPY (SELECT * EXCLUDE (raw_row_number) FROM opp WHERE raw_row_number > $($ChunkSize * 3))
  TO '$workFwd/part_4.csv' (FORMAT CSV, HEADER true);
"@
$sql | & $duckdb
if ($LASTEXITCODE -ne 0) { throw "DuckDB chunk failed" }
$dt = (Get-Date) - $t0
Write-Output ("    chunks written ({0:N1}s)" -f $dt.TotalSeconds)

Get-ChildItem "$WorkDir\part_*.csv" | ForEach-Object {
  Write-Output ("  {0}: {1:N1} MB" -f $_.Name, ($_.Length / 1MB))
}
}

# ── 2. Create stage table ──────────────────────────────────────────────────
$ddl = @"
DROP TABLE IF EXISTS public.$stage;
CREATE UNLOGGED TABLE public.$stage (
  agency             TEXT,
  state_code         CHAR(2),
  city               TEXT,
  stop_date          DATE,
  stop_time          TIME,
  subject_race       TEXT,
  subject_sex        CHAR(1),
  subject_age        SMALLINT,
  officer_id         TEXT,
  officer_race       TEXT,
  officer_sex        CHAR(1),
  stop_type          TEXT,
  violation          TEXT,
  arrest_made        BOOLEAN,
  citation_issued    BOOLEAN,
  warning_issued     BOOLEAN,
  outcome            TEXT,
  search_conducted   BOOLEAN,
  search_person      BOOLEAN,
  search_vehicle     BOOLEAN,
  contraband_found   BOOLEAN,
  contraband_drugs   BOOLEAN,
  contraband_weapons BOOLEAN,
  frisk_performed    BOOLEAN,
  reason_for_stop    TEXT,
  reason_for_search  TEXT,
  location_lat       DOUBLE PRECISION,
  location_lng       DOUBLE PRECISION,
  district           TEXT,
  county_name        TEXT,
  source_druid       TEXT
);
"@
Run-Psql -sql $ddl -label "create stage $stage"

# ── 3. \copy each chunk (each its own transaction) ─────────────────────────
$allT0 = Get-Date
for ($i = 1; $i -le 4; $i++) {
  $partPath = "$WorkDir\part_$i.csv"
  if (-not (Test-Path $partPath)) {
    Write-Output "  skipping part_$i (not found)"
    continue
  }
  if ((Get-Item $partPath).Length -lt 200) {
    Write-Output "  skipping part_$i (empty or header-only)"
    continue
  }
  Copy-Chunk -partPath $partPath -idx $i
}
$allDt = (Get-Date) - $allT0
Write-Output ("all chunks copied ({0:N1} min)" -f $allDt.TotalMinutes)

# ── 4. Promote stage to LOGGED + INSERT into police_stops ──────────────────
$promote = @"
ALTER TABLE public.$stage SET LOGGED;
INSERT INTO public.police_stops
  (agency, state_code, city, stop_date, stop_time, subject_race, subject_sex,
   subject_age, officer_id, officer_race, officer_sex, stop_type, violation,
   arrest_made, citation_issued, warning_issued, outcome, search_conducted,
   search_person, search_vehicle, contraband_found, contraband_drugs,
   contraband_weapons, frisk_performed, reason_for_stop, reason_for_search,
   location_lat, location_lng, district, county_name, source_druid)
SELECT
  agency, state_code, city, stop_date, stop_time, subject_race, subject_sex,
  subject_age, officer_id, officer_race, officer_sex, stop_type, violation,
  arrest_made, citation_issued, warning_issued, outcome, search_conducted,
  search_person, search_vehicle, contraband_found, contraband_drugs,
  contraband_weapons, frisk_performed, reason_for_stop, reason_for_search,
  location_lat, location_lng, district, county_name, source_druid
FROM public.$stage;
"@
Run-Psql -sql $promote -label "promote + INSERT police_stops"

# Row count verify
$row = & $psql $dbConnStr -t -A -c "SELECT count(*) FROM public.police_stops WHERE agency = '$Agency';"
Write-Output "police_stops $Agency final count: $row"

# ── 5. Drop stage ───────────────────────────────────────────────────────────
Run-Psql -sql "DROP TABLE public.$stage;" -label "drop stage"

Write-Output "==="
Write-Output "DONE. police_stops $Agency rows loaded: $row"