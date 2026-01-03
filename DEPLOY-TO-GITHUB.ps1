# Showduino GitHub Deployment Script
# PowerShell version

Write-Host ""
Write-Host "========================================"
Write-Host "Showduino GitHub Deployment"
Write-Host "========================================"
Write-Host ""

$repoPath = Read-Host "Enter path to your GitHub repository folder"

if ([string]::IsNullOrWhiteSpace($repoPath)) {
    Write-Host "ERROR: No path provided!" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

if (-not (Test-Path $repoPath)) {
    Write-Host "ERROR: Directory does not exist: $repoPath" -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "Copying files to: $repoPath"
Write-Host ""

try {
    $sourceDir = $PSScriptRoot
    Copy-Item -Path "$sourceDir\*" -Destination $repoPath -Recurse -Force
    
    Write-Host ""
    Write-Host "========================================"
    Write-Host "SUCCESS! Files copied successfully!"
    Write-Host "========================================"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "1. Open Command Prompt, PowerShell, or Git Bash"
    Write-Host "2. Navigate to: $repoPath"
    Write-Host "3. Run these commands:"
    Write-Host ""
    Write-Host "   git add ."
    Write-Host "   git commit -m `"Update website with HauntSync and Studio`""
    Write-Host "   git push origin main"
    Write-Host ""
    Write-Host "Your website will be live in 2-3 minutes!"
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to copy files!" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Read-Host "Press Enter to exit"
