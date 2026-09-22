param(
    [string]$ProjectPath = "."
)

$ErrorActionPreference = 'Stop'

$root = (Resolve-Path -LiteralPath $ProjectPath).Path

function Test-RepoPath {
    param([string]$RelativePath)
    return Test-Path -LiteralPath (Join-Path $root $RelativePath)
}

function Read-JsonFile {
    param([string]$RelativePath)

    if (-not (Test-RepoPath $RelativePath)) {
        return $null
    }

    try {
        return (Get-Content -LiteralPath (Join-Path $root $RelativePath) -Raw | ConvertFrom-Json)
    }
    catch {
        return $null
    }
}

function Read-TextFile {
    param([string]$RelativePath)

    if (-not (Test-RepoPath $RelativePath)) {
        return ''
    }

    return Get-Content -LiteralPath (Join-Path $root $RelativePath) -Raw
}

function Get-TomlValue {
    param(
        [string]$Text,
        [string]$Key
    )

    if ([string]::IsNullOrWhiteSpace($Text)) {
        return ''
    }

    $pattern = '(?m)^\s*' + [regex]::Escape($Key) + '\s*=\s*["'']([^"'']+)["'']'
    $match = [regex]::Match($Text, $pattern)
    if ($match.Success) {
        return $match.Groups[1].Value
    }

    return ''
}

function Get-LicenseFile {
    foreach ($file in @('LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING')) {
        if (Test-RepoPath $file) { return $file }
    }
    return ''
}

function Get-LicenseFromFile {
    param([string]$File)

    $sample = ((Get-Content -LiteralPath (Join-Path $root $File) | Select-Object -First 12) -join "`n")
    switch -Regex ($sample) {
        'MIT License' { return 'MIT' }
        'Apache License' { return 'Apache-2.0' }
        'GNU GENERAL PUBLIC LICENSE' { return 'GPL' }
        'BSD' { return 'BSD' }
        default { return 'See LICENSE file' }
    }
}

function Invoke-Git {
    param([string[]]$GitArgs, [string]$InputText)

    if (-not (Get-Command git -ErrorAction SilentlyContinue)) { return $null }
    try {
        if ($PSBoundParameters.ContainsKey('InputText')) {
            $out = $InputText | & git -C $root @GitArgs 2>$null
        }
        else {
            $out = & git -C $root @GitArgs 2>$null
        }
        return $out
    }
    catch {
        return $null
    }
}

$packageJson = Read-JsonFile 'package.json'
$pyprojectText = Read-TextFile 'pyproject.toml'
$cargoText = Read-TextFile 'Cargo.toml'

$projectName = if ($packageJson -and $packageJson.name) {
    [string]$packageJson.name
}
elseif ($pyprojectText) {
    $value = Get-TomlValue -Text $pyprojectText -Key 'name'
    if ($value) { $value } else { Split-Path $root -Leaf }
}
elseif ($cargoText) {
    $value = Get-TomlValue -Text $cargoText -Key 'name'
    if ($value) { $value } else { Split-Path $root -Leaf }
}
else {
    Split-Path $root -Leaf
}

$description = if ($packageJson -and $packageJson.description) {
    [string]$packageJson.description
}
elseif ($pyprojectText) {
    Get-TomlValue -Text $pyprojectText -Key 'description'
}
elseif ($cargoText) {
    Get-TomlValue -Text $cargoText -Key 'description'
}
else {
    ''
}

$manifestLicense = if ($packageJson -and $packageJson.license) {
    [string]$packageJson.license
}
elseif ($pyprojectText) {
    Get-TomlValue -Text $pyprojectText -Key 'license'
}
elseif ($cargoText) {
    Get-TomlValue -Text $cargoText -Key 'license'
}
else {
    ''
}

# A manifest value alone is not a licensing decision: `npm init` writes "ISC"
# into every package.json whether or not anyone chose it.
$licenseFile = Get-LicenseFile
$license = [ordered]@{
    manifest     = $manifestLicense
    file         = $licenseFile
    fileLicense  = if ($licenseFile) { Get-LicenseFromFile $licenseFile } else { '' }
    manifestOnly = [bool]($manifestLicense -and -not $licenseFile)
}

$packageManagers = New-Object System.Collections.Generic.List[string]
if (Test-RepoPath 'package-lock.json') { $packageManagers.Add('npm') }
if (Test-RepoPath 'pnpm-lock.yaml') { $packageManagers.Add('pnpm') }
if (Test-RepoPath 'yarn.lock') { $packageManagers.Add('yarn') }
if (Test-RepoPath 'pyproject.toml') { $packageManagers.Add('python') }
if (Test-RepoPath 'Cargo.toml') { $packageManagers.Add('cargo') }
if (Test-RepoPath 'go.mod') { $packageManagers.Add('go') }

$scriptMap = [ordered]@{}
if ($packageJson -and $packageJson.scripts) {
    foreach ($prop in $packageJson.scripts.PSObject.Properties) {
        $scriptMap[$prop.Name] = [string]$prop.Value
    }
}

$ciFiles = @()
if (Test-RepoPath '.github\workflows') {
    $ciFiles = Get-ChildItem -LiteralPath (Join-Path $root '.github\workflows') -File |
    Select-Object -ExpandProperty Name
}

$docs = Get-ChildItem -LiteralPath $root -File |
Where-Object { $_.Name -match '^(README|CONTRIBUTING|CHANGELOG|LICENSE)' } |
Select-Object -ExpandProperty Name

$visibleItems = @(Get-ChildItem -LiteralPath $root -Force |
    Where-Object { $_.Name -notin @('.git', 'node_modules', '.venv', '__pycache__') })

# Drop anything git ignores (build output, local secrets such as .env).
$ignored = @()
$gitNames = @($visibleItems | ForEach-Object { if ($_.PSIsContainer) { "$($_.Name)/" } else { $_.Name } })
if ($gitNames.Count -gt 0) {
    $checkOut = Invoke-Git -GitArgs @('check-ignore', '--stdin') -InputText ($gitNames -join "`n")
    if ($checkOut) { $ignored = @($checkOut | ForEach-Object { $_.TrimEnd('/') }) }
}
$trackedItems = @($visibleItems | Where-Object { $_.Name -notin $ignored } |
    Where-Object { $_.Name -notmatch '^\.env(\..+)?$' -or $_.Name -match '^\.env\.(example|sample|template)$' })

$maxItems = 40
$topLevelDirs = @($trackedItems | Where-Object { $_.PSIsContainer } | Sort-Object Name |
    Select-Object -First $maxItems | ForEach-Object { "$($_.Name)/" })
$topLevelFiles = @($trackedItems | Where-Object { -not $_.PSIsContainer } | Sort-Object Name |
    Select-Object -First $maxItems | ForEach-Object { $_.Name })

# GitHub owner/repo for badge URLs; empty when there is no GitHub remote.
# isGitRoot is false for a sub-folder of a larger repository, whose remote
# (and therefore every GitHub badge) describes the parent, not this folder.
# --show-prefix prints an empty line at the top of the work tree and the
# sub-path below it; comparing paths instead breaks on non-ASCII folder names.
$isGitRoot = $false
if ((Invoke-Git -GitArgs @('rev-parse', '--is-inside-work-tree')) -eq 'true') {
    $prefix = Invoke-Git -GitArgs @('rev-parse', '--show-prefix')
    $isGitRoot = [string]::IsNullOrWhiteSpace([string]($prefix | Select-Object -First 1))
}
$github = [ordered]@{ owner = ''; repo = ''; isGitRoot = $isGitRoot }
$remoteUrl = Invoke-Git -GitArgs @('remote', 'get-url', 'origin')
if ($remoteUrl) {
    $m = [regex]::Match([string]($remoteUrl | Select-Object -First 1), 'github\.com[:/]([^/]+)/([^/]+?)(\.git)?/?$')
    if ($m.Success) {
        $github.owner = $m.Groups[1].Value
        $github.repo = $m.Groups[2].Value
    }
}

# Configuration keys: names only, from the committed example file. Values are
# never read, and the real .env is never opened.
$envExampleFile = ''
$envKeys = @()
foreach ($candidate in @('.env.example', '.env.sample', '.env.template')) {
    if (Test-RepoPath $candidate) {
        $envExampleFile = $candidate
        $envKeys = @(Get-Content -LiteralPath (Join-Path $root $candidate) |
            ForEach-Object { if ($_ -match '^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=') { $Matches[1] } })
        break
    }
}

$result = [ordered]@{
    root            = $root
    projectName     = $projectName
    description     = $description
    license         = $license
    github          = $github
    packageManagers = @($packageManagers)
    ciFiles         = @($ciFiles)
    docs            = @($docs)
    scripts         = $scriptMap
    envExample      = [ordered]@{ file = $envExampleFile; keys = @($envKeys) }
    topLevelDirs    = @($topLevelDirs)
    topLevelFiles   = @($topLevelFiles)
}

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$result | ConvertTo-Json -Depth 6
