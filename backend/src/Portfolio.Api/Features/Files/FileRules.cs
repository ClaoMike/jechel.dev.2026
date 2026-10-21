using System.Text;
using System.Text.RegularExpressions;
using SkiaSharp;

namespace Portfolio.Api.Features.Files;

/// <summary>What the admin may upload, and how a photo is prepared before it's stored.</summary>
public static partial class FileRules
{
    public const long PhotoMaxBytes = 15 * 1024 * 1024;

    /// <summary>Papers and theses can be big. Files live in the database and are read whole, so there is still a cap.</summary>
    public const long PaperMaxBytes = 200 * 1024 * 1024;

    /// <summary>App images and videos, uploaded one at a time; the biggest request allowed is for a video.</summary>
    public const long AppImageMaxBytes = 15 * 1024 * 1024;
    public const long AppVideoMaxBytes = 200 * 1024 * 1024;

    /// <summary>Photos are scaled down to fit this many pixels on each side.</summary>
    public const int PhotoMaxPixels = 800;

    /// <summary>App images (screenshots) are kept bigger, to look sharp in the popup.</summary>
    public const int AppImageMaxPixels = 1920;

    public const int FileNameMaxLength = 100;

    public const string PhotoContentType = "image/webp";
    public const string PdfContentType = "application/pdf";

    /// <summary>The URL a stored file is served from; the name is what the browser saves it as.</summary>
    public static string UrlFor(Guid id, string fileName) => $"/api/files/{id}/{Uri.EscapeDataString(fileName)}";

    /// <summary>The id in a URL made by <see cref="UrlFor"/>, or null for any other URL.</summary>
    public static Guid? FileIdIn(string? url) =>
        url is not null && FileUrl().Match(url) is { Success: true } match ? Guid.Parse(match.Groups[1].Value) : null;

    /// <summary>A picture bigger than this (in pixels, e.g. 10,000 × 10,000) isn't decoded: it could take gigabytes of memory.</summary>
    public const long PhotoMaxSourcePixels = 100_000_000;

    /// <summary>The WebP quality photos are stored at (0–100).</summary>
    public const int PhotoQuality = 85;

    /// <summary>The only formats a photo is read from.</summary>
    private static readonly SKEncodedImageFormat[] PhotoFormats = [SKEncodedImageFormat.Jpeg, SKEncodedImageFormat.Png, SKEncodedImageFormat.Webp, SKEncodedImageFormat.Gif];

    /// <summary>
    /// Re-encodes a JPEG, PNG, WebP or GIF (its first frame) as a WebP of at most <paramref name="maxPixels"/>
    /// per side, with SkiaSharp. Turns it upright first (the EXIF orientation), and keeps nothing but the
    /// pixels: phone photos carry the GPS position they were taken at. Throws <see cref="NotAnImageException"/>
    /// when the bytes aren't one of those formats, are broken, or are too big a picture.
    /// </summary>
    public static async Task<byte[]> PreparePhotoAsync(Stream input, CancellationToken cancellationToken, int maxPixels = PhotoMaxPixels)
    {
        using var buffer = new MemoryStream();
        await input.CopyToAsync(buffer, cancellationToken);
        using var data = SKData.CreateCopy(buffer.GetBuffer().AsSpan(0, (int)buffer.Length));
        using var codec = SKCodec.Create(data) ?? throw new NotAnImageException("Not an image.");
        if (!PhotoFormats.Contains(codec.EncodedFormat)) throw new NotAnImageException($"{codec.EncodedFormat} isn't accepted.");

        var size = codec.Info;
        if ((long)size.Width * size.Height > PhotoMaxSourcePixels) throw new NotAnImageException($"{size.Width}×{size.Height} is too big a picture.");

        // Decoded into sRGB, so colours look the same in every browser once the colour profile is gone.
        var info = new SKImageInfo(size.Width, size.Height, SKColorType.Rgba8888, SKAlphaType.Premul, SKColorSpace.CreateSrgb());
        using var decoded = new SKBitmap(info);
        var result = codec.GetPixels(info, decoded.GetPixels());
        // A file cut short still has its top part: that's kept, like browsers do.
        if (result is not (SKCodecResult.Success or SKCodecResult.IncompleteInput)) throw new NotAnImageException($"It can't be decoded ({result}).");

        var origin = codec.EncodedOrigin;
        var sideways = origin is SKEncodedOrigin.LeftTop or SKEncodedOrigin.RightTop or SKEncodedOrigin.RightBottom or SKEncodedOrigin.LeftBottom;
        var (uprightWidth, uprightHeight) = sideways ? (size.Height, size.Width) : (size.Width, size.Height);
        var scale = Math.Min(1f, (float)maxPixels / Math.Max(uprightWidth, uprightHeight));
        var width = Math.Max(1, (int)Math.Round(uprightWidth * scale));
        var height = Math.Max(1, (int)Math.Round(uprightHeight * scale));

        using var surface = SKSurface.Create(new SKImageInfo(width, height, SKColorType.Rgba8888, SKAlphaType.Premul, SKColorSpace.CreateSrgb()))
            ?? throw new NotAnImageException("No room to draw it.");
        var canvas = surface.Canvas;
        canvas.Clear(SKColors.Transparent);
        canvas.Scale((float)width / uprightWidth, (float)height / uprightHeight);
        canvas.Concat(Upright(origin, size.Width, size.Height));
        using (var image = SKImage.FromBitmap(decoded))
        {
            // Mipmaps: a big photo scaled far down stays smooth instead of grainy.
            canvas.DrawImage(image, 0, 0, new SKSamplingOptions(SKFilterMode.Linear, SKMipmapMode.Linear));
        }

        using var snapshot = surface.Snapshot();
        using var webp = snapshot.Encode(SKEncodedImageFormat.Webp, PhotoQuality) ?? throw new NotAnImageException("It can't be saved as WebP.");
        return webp.ToArray();
    }

    /// <summary>
    /// Maps a picture stored as <paramref name="width"/> × <paramref name="height"/> with the EXIF orientation
    /// <paramref name="origin"/> to how it should look: x' = ScaleX·x + SkewX·y + TransX, y' = SkewY·x + ScaleY·y + TransY.
    /// </summary>
    public static SKMatrix Upright(SKEncodedOrigin origin, int width, int height) => origin switch
    {
        // 2: mirrored left to right.
        SKEncodedOrigin.TopRight => new SKMatrix(-1, 0, width, 0, 1, 0, 0, 0, 1),
        // 3: upside down.
        SKEncodedOrigin.BottomRight => new SKMatrix(-1, 0, width, 0, -1, height, 0, 0, 1),
        // 4: mirrored top to bottom.
        SKEncodedOrigin.BottomLeft => new SKMatrix(1, 0, 0, 0, -1, height, 0, 0, 1),
        // 5: mirrored along the diagonal.
        SKEncodedOrigin.LeftTop => new SKMatrix(0, 1, 0, 1, 0, 0, 0, 0, 1),
        // 6: needs turning a quarter clockwise (a phone held upright).
        SKEncodedOrigin.RightTop => new SKMatrix(0, -1, height, 1, 0, 0, 0, 0, 1),
        // 7: mirrored along the other diagonal.
        SKEncodedOrigin.RightBottom => new SKMatrix(0, -1, height, -1, 0, width, 0, 0, 1),
        // 8: needs turning a quarter anticlockwise.
        SKEncodedOrigin.LeftBottom => new SKMatrix(0, 1, 0, -1, 0, width, 0, 0, 1),
        _ => SKMatrix.Identity,
    };

    /// <summary>
    /// "video/mp4", "video/quicktime" or "video/webm" when the file starts like one, else null.
    /// MP4 and MOV start with an "ftyp" box; HEIC and AVIF photos do too, so their brands are left out.
    /// </summary>
    public static string? VideoContentType(ReadOnlySpan<byte> start)
    {
        if (start.Length >= 12 && start[4..8].SequenceEqual("ftyp"u8))
        {
            var brand = Encoding.ASCII.GetString(start[8..12]);
            if (brand is "heic" or "heix" or "heim" or "heis" or "hevc" or "hevx" or "mif1" or "msf1" or "avif" or "avis") return null;
            return brand == "qt  " ? "video/quicktime" : "video/mp4";
        }
        return start.Length >= 4 && start[..4].SequenceEqual((ReadOnlySpan<byte>)[0x1A, 0x45, 0xDF, 0xA3]) ? "video/webm" : null;
    }

    public static string VideoExtension(string contentType) => contentType switch
    {
        "video/quicktime" => ".mov",
        "video/webm" => ".webm",
        _ => ".mp4",
    };

    /// <summary>Every PDF starts with "%PDF-".</summary>
    public static bool LooksLikePdf(ReadOnlySpan<byte> start) => start.StartsWith("%PDF-"u8);

    /// <summary>
    /// A safe download name from what the browser sent: no folders or control characters, at most
    /// <see cref="FileNameMaxLength"/> characters, ending in <paramref name="extension"/>.
    /// </summary>
    public static string CleanFileName(string? name, string fallback, string extension)
    {
        var baseName = Path.GetFileNameWithoutExtension((name ?? "").Replace('\\', '/').Split('/')[^1]);
        var cleaned = new StringBuilder();
        foreach (var c in baseName.Normalize(NormalizationForm.FormC))
        {
            if (!char.IsControl(c) && c is not ('"' or '<' or '>' or '|' or ':' or '*' or '?')) cleaned.Append(c);
        }
        var result = cleaned.ToString().Trim().Trim('.');
        if (result.Length == 0) result = fallback;
        if (result.Length > FileNameMaxLength - extension.Length) result = result[..(FileNameMaxLength - extension.Length)].TrimEnd();
        return result + extension;
    }

    [GeneratedRegex(@"^/api/files/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/")]
    private static partial Regex FileUrl();
}

/// <summary>An upload that isn't a picture <see cref="FileRules.PreparePhotoAsync"/> can use.</summary>
public sealed class NotAnImageException(string message) : Exception(message);
