param(
    [string]$OutDir = "output/imagegen",
    [string]$BaseName = "huangchao-shenyi-cover",
    [string]$BaseImage = ""
)

$ErrorActionPreference = "Stop"

$root = (Resolve-Path ".").Path
$outPath = Join-Path $root $OutDir
New-Item -ItemType Directory -Force $outPath | Out-Null

$basePng = Join-Path $outPath "$BaseName-base.png"
$finalPng = Join-Path $outPath "$BaseName-600x800.png"
$finalJpg = Join-Path $outPath "$BaseName-600x800.jpg"

$prompt = @"
Use case: historical-scene
Asset type: vertical Chinese web novel cover artwork base without embedded text
Primary request: Create polished vertical cover art for a Chinese historical court novel titled "Imperial Dynasty Divine Physician and the Frail Imperial Tutor" by pen name "Beiyuesen". Generate only the atmospheric artwork and characters; leave clean readable space for title typography to be added later.
Scene/backdrop: Ancient imperial palace medical chamber at dusk, carved wooden screens, silk curtains, faint incense, medicine cabinets, scrolls, jade acupuncture tools, warm lamplight and cool moonlight through lattice windows.
Subject: Two elegant adult male leads in historical Chinese court attire: one calm imperial physician with refined robes and a medicine case; one pale, fragile imperial tutor with noble bearing near a desk with scrolls. Their relationship feels restrained, intelligent, emotionally tense, and dramatic.
Style/medium: high-end Chinese online novel cover art, cinematic photorealistic digital painting, romantic historical court drama, premium book cover composition.
Composition/framing: portrait 2:3 artwork, characters in the central/lower area, palace depth, clean darker negative space in the upper third and lower band for large Chinese title and author text; no cropped faces; no busy details behind text areas.
Lighting/mood: elegant, mysterious, healing, court intrigue, restrained romance; warm gold lamplight balanced with cool blue moonlight.
Color palette: imperial gold, deep teal, muted crimson, ivory, ink black accents; rich but not over-saturated.
Constraints: no text, no logos, no watermark, no modern objects, no gore, no explicit intimacy, no random symbols.
Avoid: blurry faces, distorted hands, excessive fantasy armor, Western architecture, modern medicine bottles, crowded composition.
"@

if ($BaseImage) {
    $resolvedBaseImage = (Resolve-Path $BaseImage).Path
    Copy-Item -LiteralPath $resolvedBaseImage -Destination $basePng -Force
}
else {
    if (-not $env:OPENAI_API_KEY) {
        throw "OPENAI_API_KEY is not set. In PowerShell, run: `$env:OPENAI_API_KEY='sk-...'"
    }

    $payload = @{
        model = "gpt-image-2"
        prompt = $prompt
        size = "1024x1536"
        quality = "high"
        output_format = "png"
    } | ConvertTo-Json -Depth 8

    $headers = @{
        Authorization = "Bearer $env:OPENAI_API_KEY"
        "Content-Type" = "application/json"
    }

    Write-Host "Generating base artwork with gpt-image-2..."
    $response = Invoke-RestMethod `
        -Uri "https://api.openai.com/v1/images/generations" `
        -Method Post `
        -Headers $headers `
        -Body $payload `
        -TimeoutSec 300

    if (-not $response.data -or -not $response.data[0].b64_json) {
        throw "Image API response did not contain b64_json output."
    }

    [IO.File]::WriteAllBytes($basePng, [Convert]::FromBase64String($response.data[0].b64_json))
}

Add-Type -AssemblyName System.Drawing

function TextFromCodepoints {
    param([int[]]$Codepoints)
    $chars = foreach ($codepoint in $Codepoints) {
        [char]$codepoint
    }
    return [string]::Concat($chars)
}

function New-Font {
    param([string]$Family, [float]$Size, [System.Drawing.FontStyle]$Style)
    try {
        return [System.Drawing.Font]::new($Family, $Size, $Style, [System.Drawing.GraphicsUnit]::Pixel)
    }
    catch {
        return [System.Drawing.Font]::new("Microsoft YaHei", $Size, $Style, [System.Drawing.GraphicsUnit]::Pixel)
    }
}

function Draw-CenteredText {
    param(
        [System.Drawing.Graphics]$Graphics,
        [string]$Text,
        [System.Drawing.Font]$Font,
        [System.Drawing.Brush]$Brush,
        [System.Drawing.Pen]$OutlinePen,
        [float]$CenterX,
        [float]$Top,
        [float]$MaxWidth,
        [float]$LineGap = 2
    )

    $format = [System.Drawing.StringFormat]::GenericTypographic
    $format.FormatFlags = [System.Drawing.StringFormatFlags]::MeasureTrailingSpaces
    $lines = @()
    foreach ($char in $Text.ToCharArray()) {
        if ($char -ne " " -and [int][char]$char -ne 0x3000) {
            $lines += [string]$char
        }
    }

    $height = 0
    foreach ($line in $lines) {
        $size = $Graphics.MeasureString($line, $Font, [System.Drawing.PointF]::new(0, 0), $format)
        $height += $size.Height + $LineGap
    }

    $y = $Top
    foreach ($line in $lines) {
        $size = $Graphics.MeasureString($line, $Font, [System.Drawing.PointF]::new(0, 0), $format)
        $x = $CenterX - ($size.Width / 2)

        $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
        $path.AddString($line, $Font.FontFamily, [int]$Font.Style, $Font.Size, [System.Drawing.PointF]::new($x, $y), $format)
        $Graphics.DrawPath($OutlinePen, $path)
        $Graphics.FillPath($Brush, $path)
        $path.Dispose()

        $y += $size.Height + $LineGap
    }

    return $height
}

function Draw-HorizontalText {
    param(
        [System.Drawing.Graphics]$Graphics,
        [string]$Text,
        [System.Drawing.Font]$Font,
        [System.Drawing.Brush]$Brush,
        [System.Drawing.Pen]$OutlinePen,
        [float]$CenterX,
        [float]$Top
    )

    $format = [System.Drawing.StringFormat]::GenericTypographic
    $size = $Graphics.MeasureString($Text, $Font, [System.Drawing.PointF]::new(0, 0), $format)
    $x = $CenterX - ($size.Width / 2)
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddString($Text, $Font.FontFamily, [int]$Font.Style, $Font.Size, [System.Drawing.PointF]::new($x, $Top), $format)
    $Graphics.DrawPath($OutlinePen, $path)
    $Graphics.FillPath($Brush, $path)
    $path.Dispose()
}

$src = [System.Drawing.Image]::FromFile($basePng)
$canvas = [System.Drawing.Bitmap]::new(600, 800)
$g = [System.Drawing.Graphics]::FromImage($canvas)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$srcRatio = $src.Width / $src.Height
$dstRatio = 600 / 800
if ($srcRatio -gt $dstRatio) {
    $cropH = $src.Height
    $cropW = [int]($cropH * $dstRatio)
    $cropX = [int](($src.Width - $cropW) / 2)
    $cropY = 0
}
else {
    $cropW = $src.Width
    $cropH = [int]($cropW / $dstRatio)
    $cropX = 0
    $cropY = [int](($src.Height - $cropH) / 2)
}
$g.DrawImage($src, [System.Drawing.Rectangle]::new(0, 0, 600, 800), [System.Drawing.Rectangle]::new($cropX, $cropY, $cropW, $cropH), [System.Drawing.GraphicsUnit]::Pixel)

$topShade = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.Rectangle]::new(0, 0, 600, 330),
    [System.Drawing.Color]::FromArgb(185, 8, 15, 24),
    [System.Drawing.Color]::FromArgb(20, 8, 15, 24),
    [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
)
$g.FillRectangle($topShade, 0, 0, 600, 330)
$topShade.Dispose()

$bottomShade = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.Rectangle]::new(0, 610, 600, 190),
    [System.Drawing.Color]::FromArgb(0, 6, 8, 12),
    [System.Drawing.Color]::FromArgb(195, 6, 8, 12),
    [System.Drawing.Drawing2D.LinearGradientMode]::Vertical
)
$g.FillRectangle($bottomShade, 0, 610, 600, 190)
$bottomShade.Dispose()

$titleFont = New-Font "SimHei" 76 ([System.Drawing.FontStyle]::Bold)
$authorFont = New-Font "KaiTi" 34 ([System.Drawing.FontStyle]::Regular)
$smallFont = New-Font "Microsoft YaHei" 22 ([System.Drawing.FontStyle]::Regular)

$goldBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 239, 206, 123))
$ivoryBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 246, 236, 210))
$darkPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(215, 18, 13, 10), 8)
$thinPen = [System.Drawing.Pen]::new([System.Drawing.Color]::FromArgb(190, 18, 13, 10), 4)

$titleLeft = TextFromCodepoints @(0x7687, 0x671D, 0x795E, 0x533B)
$titleRight = TextFromCodepoints @(0x75C5, 0x5F31, 0x5E1D, 0x5E08)
$connector = TextFromCodepoints @(0x4E0E)
$author = TextFromCodepoints @(0x5317, 0x5CB3, 0x68EE, 0x20, 0x8457)
$tagline = TextFromCodepoints @(0x5BAB, 0x5EF7, 0x20, 0x00B7, 0x20, 0x533B, 0x9053, 0x20, 0x00B7, 0x20, 0x6743, 0x8C0B)

Draw-CenteredText $g $titleLeft $titleFont $goldBrush $darkPen 230 70 150 | Out-Null
Draw-CenteredText $g $titleRight $titleFont $goldBrush $darkPen 370 120 150 | Out-Null
Draw-HorizontalText $g $connector (New-Font "KaiTi" 48 ([System.Drawing.FontStyle]::Bold)) $ivoryBrush $thinPen 300 230
Draw-HorizontalText $g $author $authorFont $ivoryBrush $thinPen 300 724
Draw-HorizontalText $g $tagline $smallFont $ivoryBrush $thinPen 300 678

$encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$encoderParams = [System.Drawing.Imaging.EncoderParameters]::new(1)
$encoderParams.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new([System.Drawing.Imaging.Encoder]::Quality, 92L)

Remove-Item -LiteralPath $finalPng, $finalJpg -Force -ErrorAction SilentlyContinue
$canvas.Save($finalPng, [System.Drawing.Imaging.ImageFormat]::Png)
$canvas.Save($finalJpg, $encoder, $encoderParams)

$g.Dispose()
$canvas.Dispose()
$src.Dispose()
$titleFont.Dispose()
$authorFont.Dispose()
$smallFont.Dispose()
$goldBrush.Dispose()
$ivoryBrush.Dispose()
$darkPen.Dispose()
$thinPen.Dispose()

Write-Host "Saved base: $basePng"
Write-Host "Saved PNG:  $finalPng"
Write-Host "Saved JPG:  $finalJpg"
