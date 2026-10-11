using System.Text;
using System.Text.RegularExpressions;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats;
using SixLabors.ImageSharp.Formats.Gif;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Processing;

namespace Portfolio.Api.Features.Files;

/// <summary>What the admin may upload, and how a photo is prepared before it's stored.</summary>
public static partial class FileRules
{
    public const long PhotoMaxBytes = 15 * 1024 * 1024;
    public const long ResumeMaxBytes = 20 * 1024 * 1024;

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

    /// <summary>
    /// The only formats a photo is read from. Leaving out TIFF, BMP and the rest keeps their
    /// decoders, where ImageSharp 3's open advisories are, out of reach.
    /// </summary>
    private static readonly Configuration PhotoFormats = new(new JpegConfigurationModule(), new PngConfigurationModule(), new WebpConfigurationModule(), new GifConfigurationModule());

    /// <summary>
    /// Re-encodes a JPEG, PNG, WebP or GIF as a WebP of at most <see cref="PhotoMaxPixels"/>
    /// per side. Turns it upright first, then drops the metadata: phone photos carry the GPS
    /// position they were taken at. Throws <see cref="ImageFormatException"/> (or
    /// <see cref="UnknownImageFormatException"/>) when the bytes aren't an image.
    /// </summary>
    public static async Task<byte[]> PreparePhotoAsync(Stream input, CancellationToken cancellationToken, int maxPixels = PhotoMaxPixels)
    {
        using var image = await Image.LoadAsync(new DecoderOptions { Configuration = PhotoFormats, MaxFrames = 1 }, input, cancellationToken);
        image.Mutate(x =>
        {
            x.AutoOrient();
            if (image.Width > maxPixels || image.Height > maxPixels)
            {
                x.Resize(new ResizeOptions { Mode = ResizeMode.Max, Size = new Size(maxPixels, maxPixels) });
            }
        });
        image.Metadata.ExifProfile = null;
        image.Metadata.IptcProfile = null;
        image.Metadata.XmpProfile = null;

        using var output = new MemoryStream();
        await image.SaveAsWebpAsync(output, new WebpEncoder { Quality = 85 }, cancellationToken);
        return output.ToArray();
    }

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
