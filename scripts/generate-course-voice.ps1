param([Parameter(Mandatory=$true)][string]$ManifestPath)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$voiceManifest = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
$voiceFolder = [System.IO.Path]::GetDirectoryName([System.IO.Path]::GetFullPath($ManifestPath))
$voiceSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
  $voiceSynth.SelectVoice('Microsoft Hanhan Desktop')
  $voiceSynth.Rate = 1
  $voiceSynth.Volume = 100
  $voiceFormat = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
  foreach ($phrase in $voiceManifest.phrases) {
    $voiceOutput = Join-Path -Path $voiceFolder -ChildPath $phrase.file
    if (Test-Path -LiteralPath $voiceOutput) { continue }
    $voiceSynth.SetOutputToWaveFile($voiceOutput, $voiceFormat)
    $voiceSynth.Speak([string]$phrase.text)
    $voiceSynth.SetOutputToNull()
  }
} finally {
  $voiceSynth.Dispose()
}
