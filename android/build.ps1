param(
    [string]$Kit = 'D:/VendorPayment/.tools/android-kit',
    [string]$Output = (Join-Path $PSScriptRoot 'output/Turf-Cricket-1.1.0.apk')
)

$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$Kit = (Resolve-Path -LiteralPath $Kit).Path
$compiler = Get-ChildItem -Path (Join-Path $Kit 'jdk') -Filter javac.exe -Recurse | Select-Object -First 1
$packager = Get-ChildItem -Path (Join-Path $Kit 'build') -Filter aapt2.exe -Recurse | Select-Object -First 1
$platform = Join-Path $Kit 'platform/android-35/android.jar'
if (!$compiler -or !$packager -or !(Test-Path -LiteralPath $platform)) {
    throw 'Provide an Android kit with a JDK, Android 35 platform, and Android SDK build tools.'
}

$buildTools = $packager.DirectoryName
$javaTools = $compiler.DirectoryName
$work = Join-Path ([System.IO.Path]::GetTempPath()) ('turf-cricket-' + [guid]::NewGuid().ToString('N'))
$Output = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Output)
New-Item -ItemType Directory -Path "$work/classes", "$work/dex" | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $Output) | Out-Null

& $packager.FullName compile --dir "$PSScriptRoot/res" -o "$work/resources.zip"
& $packager.FullName link -I $platform --manifest "$PSScriptRoot/AndroidManifest.xml" -o "$work/unsigned.apk" "$work/resources.zip"
& $compiler.FullName --release 8 -encoding UTF-8 -classpath $platform -d "$work/classes" "$PSScriptRoot/src/MainActivity.java"
$classes = @(Get-ChildItem "$work/classes" -Filter '*.class' -Recurse | ForEach-Object FullName)
& "$javaTools/java.exe" -cp "$buildTools/lib/d8.jar" com.android.tools.r8.D8 --min-api 24 --lib $platform --output "$work/dex" @classes
& "$javaTools/jar.exe" uf "$work/unsigned.apk" -C "$work/dex" classes.dex
& "$buildTools/zipalign.exe" -f 4 "$work/unsigned.apk" "$work/aligned.apk"

$signingDir = Join-Path $PSScriptRoot '.signing'
$key = Join-Path $signingDir 'turf-cricket.p12'
$passwordFile = Join-Path $signingDir 'password.dpapi'
$hasKey = Test-Path -LiteralPath $key
if ($hasKey -ne (Test-Path -LiteralPath $passwordFile)) {
    throw 'The signing key or its encrypted password is missing. Restore the matching file before signing an update.'
}

try {
    if (!$hasKey) {
        New-Item -ItemType Directory -Force -Path $signingDir | Out-Null
        $env:TURF_CRICKET_SIGNING_PASSWORD = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
        ConvertFrom-SecureString (ConvertTo-SecureString $env:TURF_CRICKET_SIGNING_PASSWORD -AsPlainText -Force) |
            Set-Content -LiteralPath $passwordFile -Encoding ascii -NoNewline
        $keyArgs = @('-genkeypair', '-storetype', 'PKCS12', '-keystore', $key, '-storepass:env', 'TURF_CRICKET_SIGNING_PASSWORD',
            '-alias', 'turf-cricket', '-keyalg', 'RSA', '-keysize', '3072', '-validity', '10000', '-dname', 'CN=Turf Cricket Android')
        & "$javaTools/keytool.exe" @keyArgs
    } else {
        $secure = (Get-Content -LiteralPath $passwordFile -Raw).Trim() | ConvertTo-SecureString
        $env:TURF_CRICKET_SIGNING_PASSWORD = [System.Net.NetworkCredential]::new('', $secure).Password
    }

    $signArgs = @('sign', '--ks', $key, '--ks-pass', 'env:TURF_CRICKET_SIGNING_PASSWORD', '--ks-key-alias', 'turf-cricket',
        '--v4-signing-enabled', 'false', '--out', $Output, "$work/aligned.apk")
    & "$javaTools/java.exe" -jar "$buildTools/lib/apksigner.jar" @signArgs
    & "$javaTools/java.exe" -jar "$buildTools/lib/apksigner.jar" verify --verbose $Output
    & "$buildTools/zipalign.exe" -c 4 $Output
    & "$buildTools/aapt.exe" dump badging $Output | Select-String 'package:|sdkVersion|targetSdkVersion|application-label:|launchable-activity:'
    Get-FileHash -Algorithm SHA256 -LiteralPath $Output
} finally {
    [Environment]::SetEnvironmentVariable('TURF_CRICKET_SIGNING_PASSWORD', $null, 'Process')
}
