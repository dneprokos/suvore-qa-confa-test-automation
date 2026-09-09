param(
    [string]$CommitMessage,
    [switch]$StageAll,
    [string]$PathspecFile = '',
    [switch]$PreviewOnly,
    [switch]$DryRun
)

# -PathspecFile is -StageAll's opposite: one path per line, and nothing outside the list is staged.
# A caller that knows exactly which files its work produced - a workflow holding two implementation
# reports, say - must not stage everything else in the tree with them, because `git add -A` in a
# repository somebody is also working in commits their unrelated edits under this run's message.
#
# A file rather than an argument list: the paths come from a document, there can be dozens, and
# `git add --pathspec-from-file` is what git provides for exactly this.

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$global:LASTEXITCODE = 0

function Exit-WithMessage {
    param(
        [string]$Message,
        [int]$Code = 1
    )

    Write-Output $Message
    exit $Code
}

function Invoke-Git {
    param(
        [Parameter(Mandatory)]
        [string[]]$Arguments
    )

    $output = & git @Arguments 2>&1
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        $text = ($output | Out-String).Trim()
        throw "git $($Arguments -join ' ') failed. $text"
    }

    return ($output | Out-String).TrimEnd()
}

function Test-GitStagedChanges {
    & git diff --cached --quiet --exit-code
    return (-not $?)
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Exit-WithMessage -Message 'Git is not available in this environment.'
}

$repoRootOutput = & git rev-parse --show-toplevel 2>$null
$repoLookupSucceeded = $?
$repoRoot = ($repoRootOutput | Select-Object -First 1)
if (-not $repoLookupSucceeded -or [string]::IsNullOrWhiteSpace($repoRoot)) {
    Exit-WithMessage -Message 'This skill must be run inside a Git repository.'
}

$repoRoot = $repoRoot.Trim()

Push-Location $repoRoot
try {
    $currentBranch = (Invoke-Git -Arguments @('branch', '--show-current')).Trim()
    if ([string]::IsNullOrWhiteSpace($currentBranch)) {
        Exit-WithMessage -Message 'Unable to determine the current branch.'
    }

    if ($StageAll -and -not [string]::IsNullOrWhiteSpace($PathspecFile)) {
        Exit-WithMessage -Message '-StageAll and -PathspecFile are mutually exclusive. One stages everything and the other stages a named list; a caller that passed both has not decided which it meant.'
    }

    if (-not [string]::IsNullOrWhiteSpace($PathspecFile)) {
        if (-not (Test-Path -LiteralPath $PathspecFile)) {
            Exit-WithMessage -Message "-PathspecFile '$PathspecFile' does not exist. Nothing was staged and nothing was committed."
        }

        $pathspecLines = @(Get-Content -LiteralPath $PathspecFile -Encoding utf8 | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
        if ($pathspecLines.Count -eq 0) {
            Exit-WithMessage -Message "-PathspecFile '$PathspecFile' is empty. Staging nothing and committing nothing is never what a caller meant."
        }

        if ($DryRun) {
            Write-Output "[DryRun] Would stage $($pathspecLines.Count) path(s) with: git add --pathspec-from-file=$PathspecFile"
            foreach ($line in $pathspecLines) {
                Write-Output "[DryRun]   $line"
            }
        }
        else {
            Write-Output "Staging $($pathspecLines.Count) path(s) from $PathspecFile..."
            Invoke-Git -Arguments @('add', '--pathspec-from-file', $PathspecFile) | Out-Null
        }
    }
    elseif ($StageAll) {
        if ($DryRun) {
            Write-Output '[DryRun] Would stage all unstaged files with: git add -A'
        }
        else {
            Write-Output 'Staging all unstaged files...'
            Invoke-Git -Arguments @('add', '-A') | Out-Null
        }
    }

    $statusOutput = Invoke-Git -Arguments @('status', '--short')
    $stagedFiles = Invoke-Git -Arguments @('diff', '--cached', '--name-only')
    $stagedStat = Invoke-Git -Arguments @('diff', '--cached', '--stat')
    $hasStagedChanges = Test-GitStagedChanges

    $wouldStage = $StageAll -or -not [string]::IsNullOrWhiteSpace($PathspecFile)
    if ($DryRun -and $wouldStage -and -not $hasStagedChanges -and -not [string]::IsNullOrWhiteSpace($statusOutput)) {
        $hasStagedChanges = $true
    }

    Write-Output "Current branch: $currentBranch"
    Write-Output ''
    Write-Output 'Git status:'
    if ([string]::IsNullOrWhiteSpace($statusOutput)) {
        Write-Output '(working tree clean)'
    }
    else {
        Write-Output $statusOutput
    }

    Write-Output ''
    Write-Output 'Staged files:'
    if ([string]::IsNullOrWhiteSpace($stagedFiles)) {
        Write-Output '(no staged files)'
    }
    else {
        Write-Output $stagedFiles
    }

    Write-Output ''
    Write-Output 'Staged diff summary:'
    if ([string]::IsNullOrWhiteSpace($stagedStat)) {
        Write-Output '(no staged diff summary)'
    }
    else {
        Write-Output $stagedStat
    }

    if ($PreviewOnly) {
        return
    }

    if (-not $hasStagedChanges) {
        Exit-WithMessage -Message 'No staged changes are available to commit.'
    }

    if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
        Exit-WithMessage -Message 'A commit message should be specified for this skill.'
    }

    if ($DryRun) {
        Write-Output ''
        Write-Output "[DryRun] Would create commit on '$currentBranch' with message: $CommitMessage"
        return
    }

    Invoke-Git -Arguments @('commit', '-m', $CommitMessage) | Out-Null
    Write-Output ''
    Write-Output "Created commit on '$currentBranch' with message: $CommitMessage"
}
finally {
    Pop-Location
}
