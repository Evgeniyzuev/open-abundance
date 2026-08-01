$path = Join-Path (Get-Location) '.env'
$values = @{}
foreach ($line in Get-Content -LiteralPath $path) {
  if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
    $values[$matches[1]] = $matches[2].Trim().Trim('"').Trim("'")
  }
}
$pw = [string]$values['POSTGRES_PASSWORD']
if ([string]::IsNullOrWhiteSpace($pw)) {
  throw 'POSTGRES_PASSWORD is missing in .env'
}

& supabase db push --linked --password $pw --debug
$exitCode = $LASTEXITCODE
Remove-Variable pw -ErrorAction SilentlyContinue
exit $exitCode