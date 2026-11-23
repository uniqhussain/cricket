$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$paths = @('app', 'test', 'package.json', 'package-lock.json', 'tsconfig.json', '.gitignore')
$env:GIT_TERMINAL_PROMPT = '0'
$env:GIT_SSH_COMMAND = 'ssh -o BatchMode=yes -o ConnectTimeout=10'
$previous = ''
$stableSince = Get-Date
Write-Host 'Watching Cricket. Changes push after 15 seconds without edits. Press Ctrl+C to stop.'

while ($true) {
    $branch = git branch --show-current
    if ($LASTEXITCODE -ne 0 -or $branch -ne 'main') {
        throw 'Auto-push requires the main branch. Stopped.'
    }
    $existing = @($paths | Where-Object { Test-Path -LiteralPath $_ })
    $status = @(git status --porcelain --untracked-files=all -- $paths)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read Git status.' }
    $files = @($existing | ForEach-Object {
        if (Test-Path -LiteralPath $_ -PathType Container) {
            Get-ChildItem -LiteralPath $_ -Recurse -File
        } else {
            Get-Item -LiteralPath $_
        }
    })
    $fingerprint = ($files | Sort-Object FullName | ForEach-Object {
        $_.FullName + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
    }) -join '|'
    $current = ($status -join '|') + $fingerprint
    if ($current -ne $previous) {
        $previous = $current
        $stableSince = Get-Date
    }
    if (((Get-Date) - $stableSince).TotalSeconds -ge 15) {
        if ($status.Count -gt 0) {
            git diff --cached --quiet
            if ($LASTEXITCODE -eq 1) {
                Write-Host 'Existing staged changes found. Waiting for them to be committed.'
                Start-Sleep -Seconds 15
                continue
            }
            git add -A -- $existing
            if ($LASTEXITCODE -eq 0) {
                git commit -m 'Update cricket app'
                if ($LASTEXITCODE -ne 0) { Write-Host 'Commit failed. Retrying later.' }
            }
        }
        git push origin main
        if ($LASTEXITCODE -ne 0) {
            Write-Host 'Push failed. Retrying in 30 seconds.'
            Start-Sleep -Seconds 30
        } else {
            $stableSince = Get-Date
        }
    }
    Start-Sleep -Seconds 5
}
