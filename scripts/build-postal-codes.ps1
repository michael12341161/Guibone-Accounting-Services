$ErrorActionPreference = 'Stop'

$dataDir = "c:\xampp\htdocs\Monitoring\monitoring\src\data"
$addressPath = Join-Path $dataDir "ph-address.json"
$zipPath = Join-Path $dataDir "PH_zip\zipcodes.ph.json"

if (-not (Test-Path $zipPath)) {
  throw "Missing $zipPath. Downloaded dataset not found."
}

$address = Get-Content $addressPath -Raw | ConvertFrom-Json
$zipData = Get-Content $zipPath -Raw | ConvertFrom-Json

function Normalize([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) {
    return ""
  }

  $value = $value.Normalize([Text.NormalizationForm]::FormD)
  $chars = New-Object System.Collections.Generic.List[char]
  foreach ($ch in $value.ToCharArray()) {
    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($ch) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
      $chars.Add($ch)
    }
  }

  $value = (-join $chars).ToLowerInvariant()
  $value = [regex]::Replace($value, "\(.*?\)", " ")
  $value = [regex]::Replace($value, "[^a-z0-9]+", " ")
  $value = [regex]::Replace($value, "\s+", " ").Trim()

  return $value
}

function NormalizeProvince([string]$value) {
  if (-not $value) {
    return ""
  }

  $value = $value -replace "^(province|city) of\s+", ""
  return Normalize $value
}

function BuildKeys([string]$name) {
  $variants = @(
    $name,
    ($name -replace "\b(city|municipality)\b", " "),
    ($name -replace "\b(city|municipality)\s+of\b", " "),
    ($name -replace "\b(city|municipality|of)\b", " ")
  )

  $keys = New-Object System.Collections.Generic.List[string]
  foreach ($variant in $variants) {
    $key = Normalize $variant
    if ($key -and -not $keys.Contains($key)) {
      $keys.Add($key)
    }
  }

  return ,$keys.ToArray()
}

$provinceMap = @{}
foreach ($province in $address.provinces) {
  $provinceMap[$province.code] = $province.name
}

$entriesByPlace = @{}
foreach ($entry in $zipData) {
  $placeKey = Normalize $entry.place
  if (-not $placeKey) {
    continue
  }

  $zip = [string]$entry.zipcode
  if ($zip -match "^\d+$" -and $zip.Length -lt 4) {
    $zip = $zip.PadLeft(4, '0')
  }

  $item = [PSCustomObject]@{
    zip = $zip
    provinceKey = NormalizeProvince $entry.province
    place = $entry.place
  }

  if (-not $entriesByPlace.ContainsKey($placeKey)) {
    $entriesByPlace[$placeKey] = New-Object System.Collections.Generic.List[object]
  }

  $entriesByPlace[$placeKey].Add($item)
}

$postalCodes = @{}
$matched = 0

foreach ($city in $address.cities) {
  $cityName = $city.name
  $provinceName = $provinceMap[$city.provinceCode]
  $provinceKey = NormalizeProvince $provinceName
  $keys = BuildKeys $cityName
  $found = $null

  foreach ($key in $keys) {
    if (-not $entriesByPlace.ContainsKey($key)) {
      continue
    }

    $entries = $entriesByPlace[$key]
    if ($provinceKey) {
      $found = $entries | Where-Object { $_.provinceKey -eq $provinceKey } | Select-Object -First 1
    }

    if (-not $found) {
      $found = $entries | Select-Object -First 1
    }

    if ($found) {
      break
    }
  }

  if ($found) {
    $postalCodes[$city.code] = $found.zip
    $matched++
  }
}

$address | Add-Member -Force -NotePropertyName postalCodes -NotePropertyValue $postalCodes
$address | ConvertTo-Json -Depth 6 | Set-Content $addressPath -Encoding UTF8

Write-Host "Postal codes mapped for $matched cities out of $($address.cities.Count)."
