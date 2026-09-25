function New-InventorySecret {
  $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $bytes = New-Object byte[] 32
    $generator.GetBytes($bytes)
    return [Convert]::ToBase64String($bytes)
  }
  finally {
    $generator.Dispose()
  }
}

Write-Output "APP_ENCRYPTION_KEY=$(New-InventorySecret)"
Write-Output "SESSION_SECRET=$(New-InventorySecret)"
