<#
.SYNOPSIS
    Connectivity check for the collection API. Prints NO secrets.

.DESCRIPTION
    Reads src-tauri/.env, makes one request, and reports the HTTP status plus a
    few non-sensitive facts about the response (result count, filter counts, the
    first title). The base URL, the key and the full request URL are never
    printed, so this is safe to run with the output pasted anywhere.

    Use it to tell "the API is down / the key is wrong" apart from "the port's
    request is malformed" before debugging the app.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/check-api.ps1
#>

[CmdletBinding()]
param(
    [string] $EnvFile = '',
    [int]    $Limit   = 3
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $EnvFile = Join-Path $repoRoot 'src-tauri/.env'
}

if (-not (Test-Path -LiteralPath $EnvFile)) {
    throw "No env file at $EnvFile. Run: npm run extract:api-config"
}

# Parse KEY=VALUE, ignoring comments and blanks.
$config = @{}
foreach ($line in Get-Content -LiteralPath $EnvFile) {
    if ($line -match '^\s*#') { continue }
    if ($line -notmatch '=') { continue }
    $pair = $line -split '=', 2
    $val = $pair[1].Trim()
    if ($val -match '^"(.*)"$') { $val = $Matches[1] }
    $config[$pair[0].Trim()] = $val
}

function Get-Value([string] $Name) {
    if ($config.ContainsKey($Name)) { return $config[$Name] }
    return ''
}

$baseUrl = Get-Value 'MAP_API_BASE_URL'
$apiKey  = Get-Value 'MAP_API_KEY'
$path    = Get-Value 'MAP_API_COLLECTION_PATH'
if ([string]::IsNullOrWhiteSpace($path)) { $path = 'api/public_hook/v1/artwork' }

if ([string]::IsNullOrWhiteSpace($baseUrl) -or [string]::IsNullOrWhiteSpace($apiKey)) {
    throw 'MAP_API_BASE_URL or MAP_API_KEY is missing from the env file.'
}

$uri = "$($baseUrl.TrimEnd('/'))/$($path.TrimStart('/'))?key=$apiKey&limit=$Limit&page=1"

# ---------------------------------------------------------------------------
# Step 1 - OAuth login.
#
# The collection endpoint returns HTTP 500 with only ?key=, so a bearer token is
# required. Unity POSTs the LoginData object as JSON (JsonUtility.ToJson) to
# oauth/token and stores access_token; the DLL then attaches it to every request.
# ---------------------------------------------------------------------------
$loginPath = Get-Value 'MAP_API_LOGIN_PATH'
if ([string]::IsNullOrWhiteSpace($loginPath)) { $loginPath = 'oauth/token' }
$loginUri = "$($baseUrl.TrimEnd('/'))/$($loginPath.TrimStart('/'))"

$loginBody = @{
    grant_type    = Get-Value 'MAP_OAUTH_GRANT_TYPE'
    client_id     = Get-Value 'MAP_OAUTH_CLIENT_ID'
    client_secret = Get-Value 'MAP_OAUTH_CLIENT_SECRET'
    username      = Get-Value 'MAP_OAUTH_USERNAME'
    password      = Get-Value 'MAP_OAUTH_PASSWORD'
    scope         = Get-Value 'MAP_OAUTH_SCOPE'
} | ConvertTo-Json -Compress

$token = ''
if ([string]::IsNullOrWhiteSpace((Get-Value 'MAP_OAUTH_CLIENT_ID'))) {
    Write-Host 'No MAP_OAUTH_CLIENT_ID - skipping login. Expect HTTP 500.' -ForegroundColor Yellow
}
else {
    Write-Host ''
    Write-Host 'Logging in (credentials withheld)...'
    $loginSw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $loginResponse = Invoke-RestMethod -Uri $loginUri -Method Post -Body $loginBody `
            -ContentType 'application/json' -TimeoutSec 30
        $loginSw.Stop()

        if ($loginResponse.PSObject.Properties.Name -contains 'access_token' -and $loginResponse.access_token) {
            $token = $loginResponse.access_token
            $expires = if ($loginResponse.PSObject.Properties.Name -contains 'expires_in') { $loginResponse.expires_in } else { 'unknown' }
            Write-Host ("Login OK in {0} ms - token set ({1} chars), expires_in {2}" -f `
                $loginSw.ElapsedMilliseconds, $token.Length, $expires) -ForegroundColor Green
        }
        else {
            Write-Host 'Login returned no access_token.' -ForegroundColor Red
            Write-Host ("Response keys: {0}" -f ($loginResponse.PSObject.Properties.Name -join ', '))
        }
    }
    catch {
        $loginSw.Stop()
        $loginStatus = ''
        if ($_.Exception.PSObject.Properties.Name -contains 'Response' -and $_.Exception.Response) {
            $loginStatus = [int]$_.Exception.Response.StatusCode
        }
        if ($loginStatus) {
            Write-Host ("Login FAILED: HTTP {0}" -f $loginStatus) -ForegroundColor Red
        }
        else {
            Write-Host 'Login FAILED: could not complete the request.' -ForegroundColor Red
        }
    }
}

Write-Host ''
Write-Host 'Requesting the collection endpoint (URL, key and token withheld)...'

$headers = @{}
if ($token) { $headers['Authorization'] = "Bearer $token" }

$sw = [System.Diagnostics.Stopwatch]::StartNew()
try {
    # -UseBasicParsing keeps this working on a machine with no IE engine.
    $response = Invoke-WebRequest -Uri $uri -Method Get -Headers $headers -TimeoutSec 30 -UseBasicParsing
    $sw.Stop()

    Write-Host ("HTTP {0} in {1} ms" -f [int]$response.StatusCode, $sw.ElapsedMilliseconds) -ForegroundColor Green

    $data = $response.Content | ConvertFrom-Json

    $items = $null
    if ($data.PSObject.Properties.Name -contains 'results') { $items = $data.results.data }

    if ($null -eq $items) {
        Write-Host 'Response parsed, but results.data is absent - the shape has changed.' -ForegroundColor Yellow
        Write-Host ("Top-level keys: {0}" -f ($data.PSObject.Properties.Name -join ', '))
        exit 1
    }

    $pagination = $data.results.pagination
    Write-Host ''
    Write-Host 'Response looks well-formed:'
    Write-Host ("  items on this page : {0}" -f @($items).Count)
    Write-Host ("  total              : {0}" -f $pagination.total)
    Write-Host ("  last_page          : {0}" -f $pagination.last_page)

    $withImages = @($items | Where-Object { $_.primary_image }).Count
    Write-Host ("  with primary_image : {0}" -f $withImages)

    # How many records the puzzle can actually choose from. `loadCollectionArtwork`
    # needs BOTH an image and a non-empty title (it prefers titled records so the
    # name above the board is never blank), so this count -- not the page size -- is
    # the real pool for a random pick. A pool of 1 makes "Play Again" hand back the
    # same artwork every time.
    $playableTitled = @($items | Where-Object {
        $_.primary_image -and -not [string]::IsNullOrWhiteSpace($_.title)
    }).Count
    Write-Host ("  image AND title    : {0}   <- the random-pick pool" -f $playableTitled)

    if (@($items).Count -gt 0) {
        Write-Host ("  first title        : {0}" -f $items[0].title)
    }

    if ($data.PSObject.Properties.Name -contains 'filters') {
        $f = $data.filters
        Write-Host ''
        Write-Host 'Filter option counts:'
        foreach ($name in @('department', 'classification', 'artist', 'culture', 'date')) {
            if ($f.PSObject.Properties.Name -contains $name) {
                Write-Host ("  {0,-15} {1}" -f $name, @($f.$name).Count)
            }
            else {
                Write-Host ("  {0,-15} ABSENT" -f $name) -ForegroundColor Yellow
            }
        }

        # Departments in full. The "Select The Collection" screen maps one button to
        # each, and the button must send the department's real ID -- a label typo
        # would silently return an unfiltered grid rather than an error.
        if ($f.PSObject.Properties.Name -contains 'department') {
            Write-Host ''
            Write-Host 'Departments (id -> dept), the Select-The-Collection mapping:'
            foreach ($d in $f.department) {
                Write-Host ("  {0,4} -> {1}" -f $d.id, $d.dept)
            }
        }
    }
    else {
        Write-Host 'No "filters" object in the response - the dropdowns will be empty.' -ForegroundColor Yellow
    }

    Write-Host ''
    Write-Host 'API reachable and the documented shape holds.' -ForegroundColor Green
}
catch {
    $sw.Stop()
    $status = ''
    if ($_.Exception.PSObject.Properties.Name -contains 'Response' -and $_.Exception.Response) {
        $status = [int]$_.Exception.Response.StatusCode
    }

    Write-Host ''
    if ($status) {
        Write-Host ("FAILED: HTTP {0} after {1} ms" -f $status, $sw.ElapsedMilliseconds) -ForegroundColor Red
        if ($status -eq 401 -or $status -eq 403) {
            Write-Host 'That is an auth failure - the key is wrong, expired, or was rotated.' -ForegroundColor Yellow
        }
    }
    else {
        # Deliberately does not echo the exception message: reqwest-style errors and
        # .NET WebException both embed the full request URL, which carries the key.
        Write-Host ("FAILED: could not complete the request after {0} ms" -f $sw.ElapsedMilliseconds) -ForegroundColor Red
        Write-Host 'No HTTP status, so this is DNS, TLS, a firewall, or the host being unreachable.' -ForegroundColor Yellow
        Write-Host 'The private base URL may only resolve from inside the museum network.' -ForegroundColor Yellow
    }
    exit 1
}
