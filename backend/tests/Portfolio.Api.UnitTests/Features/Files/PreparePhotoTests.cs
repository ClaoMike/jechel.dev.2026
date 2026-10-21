using System.Buffers.Binary;
using System.Text;
using Portfolio.Api.Features.Files;
using SkiaSharp;

namespace Portfolio.Api.UnitTests.Features.Files;

/// <summary>FileRules.PreparePhotoAsync: uploads made into small, upright WebPs without metadata.</summary>
public class PreparePhotoTests
{
    private static readonly SKColor Red = new(220, 30, 30), Green = new(30, 200, 30), Blue = new(30, 30, 220), Yellow = new(230, 220, 30);

    /// <summary>A picture in four quarters: red top left, green top right, blue bottom left, yellow bottom right.</summary>
    private static SKBitmap Quarters(int width, int height)
    {
        var bitmap = new SKBitmap(width, height);
        using var canvas = new SKCanvas(bitmap);
        canvas.DrawRect(0, 0, width / 2f, height / 2f, new SKPaint { Color = Red });
        canvas.DrawRect(width / 2f, 0, width / 2f, height / 2f, new SKPaint { Color = Green });
        canvas.DrawRect(0, height / 2f, width / 2f, height / 2f, new SKPaint { Color = Blue });
        canvas.DrawRect(width / 2f, height / 2f, width / 2f, height / 2f, new SKPaint { Color = Yellow });
        return bitmap;
    }

    private static byte[] Encode(SKBitmap bitmap, SKEncodedImageFormat format, int quality = 95)
    {
        using var image = SKImage.FromBitmap(bitmap);
        using var data = image.Encode(format, quality);
        return data.ToArray();
    }

    /// <summary>A JPEG carrying an EXIF block: the orientation, and a description with where it was taken (as phones note the GPS position).</summary>
    private static byte[] JpegWithExif(SKBitmap bitmap, ushort orientation, string note = "Taken at 51.5074 N, 0.1278 W")
    {
        var jpeg = Encode(bitmap, SKEncodedImageFormat.Jpeg);
        var text = Encoding.ASCII.GetBytes(note + "\0");
        // TIFF header (big-endian), IFD0 with two entries: Orientation (SHORT) and ImageDescription (ASCII, after the IFD).
        var tiff = new byte[8 + 2 + 2 * 12 + 4 + text.Length];
        "MM\0*"u8.CopyTo(tiff);
        BinaryPrimitives.WriteUInt32BigEndian(tiff.AsSpan(4), 8);
        BinaryPrimitives.WriteUInt16BigEndian(tiff.AsSpan(8), 2);
        void Entry(int at, ushort tag, ushort type, uint count, uint value)
        {
            BinaryPrimitives.WriteUInt16BigEndian(tiff.AsSpan(at), tag);
            BinaryPrimitives.WriteUInt16BigEndian(tiff.AsSpan(at + 2), type);
            BinaryPrimitives.WriteUInt32BigEndian(tiff.AsSpan(at + 4), count);
            BinaryPrimitives.WriteUInt32BigEndian(tiff.AsSpan(at + 8), value);
        }
        Entry(10, 0x010E, 2, (uint)text.Length, 8 + 2 + 2 * 12 + 4);
        Entry(22, 0x0112, 3, 1, (uint)orientation << 16);
        text.CopyTo(tiff, 8 + 2 + 2 * 12 + 4);

        var payload = Encoding.ASCII.GetBytes("Exif\0\0").Concat(tiff).ToArray();
        var app1 = new byte[4 + payload.Length];
        app1[0] = 0xFF;
        app1[1] = 0xE1;
        BinaryPrimitives.WriteUInt16BigEndian(app1.AsSpan(2), (ushort)(payload.Length + 2));
        payload.CopyTo(app1, 4);
        return [.. jpeg[..2], .. app1, .. jpeg[2..]];
    }

    private static async Task<byte[]> PrepareAsync(byte[] upload, int maxPixels = FileRules.PhotoMaxPixels) =>
        await FileRules.PreparePhotoAsync(new MemoryStream(upload), CancellationToken.None, maxPixels);

    private static SKBitmap Decode(byte[] webp)
    {
        Assert.Equal("RIFF", Encoding.ASCII.GetString(webp, 0, 4));
        Assert.Equal("WEBP", Encoding.ASCII.GetString(webp, 8, 4));
        return SKBitmap.Decode(webp);
    }

    /// <summary>The colour at the middle of each quarter: top left, top right, bottom left, bottom right.</summary>
    private static SKColor[] QuarterColours(SKBitmap bitmap)
    {
        int x1 = bitmap.Width / 4, x2 = bitmap.Width * 3 / 4, y1 = bitmap.Height / 4, y2 = bitmap.Height * 3 / 4;
        return [bitmap.GetPixel(x1, y1), bitmap.GetPixel(x2, y1), bitmap.GetPixel(x1, y2), bitmap.GetPixel(x2, y2)];
    }

    private static void AssertClose(SKColor expected, SKColor actual)
    {
        var close = Math.Abs(expected.Red - actual.Red) < 40 && Math.Abs(expected.Green - actual.Green) < 40 && Math.Abs(expected.Blue - actual.Blue) < 40;
        Assert.True(close, $"Expected about {expected}, got {actual}.");
    }

    [Fact]
    public async Task Scales_a_big_photo_down_to_fit_800_pixels_keeping_its_shape()
    {
        using var photo = Quarters(2000, 1000);

        using var result = Decode(await PrepareAsync(Encode(photo, SKEncodedImageFormat.Jpeg)));

        Assert.Equal((800, 400), (result.Width, result.Height));
        var colours = QuarterColours(result);
        AssertClose(Red, colours[0]);
        AssertClose(Yellow, colours[3]);
    }

    [Fact]
    public async Task Keeps_a_small_photo_its_size()
    {
        using var photo = Quarters(300, 200);

        using var result = Decode(await PrepareAsync(Encode(photo, SKEncodedImageFormat.Png)));

        Assert.Equal((300, 200), (result.Width, result.Height));
    }

    [Fact]
    public async Task Keeps_app_images_up_to_1920_pixels()
    {
        using var screenshot = Quarters(1000, 3000);

        using var result = Decode(await PrepareAsync(Encode(screenshot, SKEncodedImageFormat.Png), FileRules.AppImageMaxPixels));

        Assert.Equal((640, 1920), (result.Width, result.Height));
    }

    [Theory]
    [InlineData(1, 40, 20, "red green blue yellow")]
    [InlineData(2, 40, 20, "green red yellow blue")]
    [InlineData(3, 40, 20, "yellow blue green red")]
    [InlineData(4, 40, 20, "blue yellow red green")]
    [InlineData(5, 20, 40, "red blue green yellow")]
    [InlineData(6, 20, 40, "blue red yellow green")]
    [InlineData(7, 20, 40, "yellow green blue red")]
    [InlineData(8, 20, 40, "green yellow red blue")]
    public async Task Turns_a_photo_upright_by_its_EXIF_orientation(ushort orientation, int width, int height, string quarters)
    {
        using var photo = Quarters(40, 20);
        var named = new Dictionary<string, SKColor> { ["red"] = Red, ["green"] = Green, ["blue"] = Blue, ["yellow"] = Yellow };

        using var result = Decode(await PrepareAsync(JpegWithExif(photo, orientation)));

        Assert.Equal((width, height), (result.Width, result.Height));
        var colours = QuarterColours(result);
        var expected = quarters.Split(' ');
        for (var i = 0; i < 4; i++) AssertClose(named[expected[i]], colours[i]);
    }

    [Fact]
    public async Task Turns_a_big_sideways_photo_upright_then_fits_it()
    {
        using var photo = Quarters(1600, 1200);

        using var result = Decode(await PrepareAsync(JpegWithExif(photo, 6)));

        Assert.Equal((600, 800), (result.Width, result.Height));
        AssertClose(Blue, QuarterColours(result)[0]);
    }

    [Fact]
    public async Task Keeps_nothing_but_the_pixels_no_EXIF_and_no_location()
    {
        using var photo = Quarters(40, 20);
        var upload = JpegWithExif(photo, 1, "GPS 51.5074 N");
        Assert.Contains("GPS 51.5074 N", Encoding.ASCII.GetString(upload));

        var result = Encoding.ASCII.GetString(await PrepareAsync(upload));

        Assert.DoesNotContain("GPS", result);
        Assert.DoesNotContain("Exif", result);
        Assert.DoesNotContain("EXIF", result);
        Assert.DoesNotContain("XMP ", result);
    }

    [Fact]
    public async Task Keeps_transparency()
    {
        using var logo = new SKBitmap(new SKImageInfo(20, 20, SKColorType.Rgba8888, SKAlphaType.Premul));
        logo.Erase(SKColors.Transparent);
        using (var canvas = new SKCanvas(logo)) canvas.DrawRect(0, 0, 10, 20, new SKPaint { Color = Red });

        using var result = Decode(await PrepareAsync(Encode(logo, SKEncodedImageFormat.Png)));

        Assert.Equal(0, result.GetPixel(15, 10).Alpha);
        Assert.Equal(255, result.GetPixel(5, 10).Alpha);
    }

    [Fact]
    public async Task Reads_WebP_and_GIF_too()
    {
        using var photo = Quarters(60, 40);
        // A 1×1 GIF.
        var gif = Convert.FromBase64String("R0lGODlhAQABAIAAAP///wAAACwAAAAAAQABAAACAkQBADs=");

        using var fromWebp = Decode(await PrepareAsync(Encode(photo, SKEncodedImageFormat.Webp)));
        using var fromGif = Decode(await PrepareAsync(gif));

        Assert.Equal((60, 40), (fromWebp.Width, fromWebp.Height));
        Assert.Equal((1, 1), (fromGif.Width, fromGif.Height));
    }

    [Fact]
    public async Task Keeps_what_there_is_of_a_photo_cut_short()
    {
        using var photo = Quarters(400, 400);
        var jpeg = Encode(photo, SKEncodedImageFormat.Jpeg);

        using var result = Decode(await PrepareAsync(jpeg[..(jpeg.Length * 2 / 3)]));

        Assert.Equal((400, 400), (result.Width, result.Height));
        AssertClose(Red, QuarterColours(result)[0]);
    }

    [Fact]
    public async Task Refuses_what_isnt_an_image()
    {
        await Assert.ThrowsAsync<NotAnImageException>(() => PrepareAsync("%PDF-1.7 not a photo"u8.ToArray()));
        await Assert.ThrowsAsync<NotAnImageException>(() => PrepareAsync([]));
    }

    [Fact]
    public async Task Refuses_formats_it_isnt_meant_to_read_like_BMP()
    {
        // A 1×1 BMP: Skia could read it, but photos are JPEG, PNG, WebP or GIF only.
        var bmp = new byte[58];
        "BM"u8.CopyTo(bmp);
        BinaryPrimitives.WriteUInt32LittleEndian(bmp.AsSpan(2), 58);
        BinaryPrimitives.WriteUInt32LittleEndian(bmp.AsSpan(10), 54);
        BinaryPrimitives.WriteUInt32LittleEndian(bmp.AsSpan(14), 40);
        BinaryPrimitives.WriteInt32LittleEndian(bmp.AsSpan(18), 1);
        BinaryPrimitives.WriteInt32LittleEndian(bmp.AsSpan(22), 1);
        BinaryPrimitives.WriteUInt16LittleEndian(bmp.AsSpan(26), 1);
        BinaryPrimitives.WriteUInt16LittleEndian(bmp.AsSpan(28), 24);
        using (var check = SKCodec.Create(SKData.CreateCopy(bmp))) Assert.Equal(SKEncodedImageFormat.Bmp, check?.EncodedFormat);

        var error = await Assert.ThrowsAsync<NotAnImageException>(() => PrepareAsync(bmp));
        Assert.Equal("Bmp isn't accepted.", error.Message);
    }

    [Fact]
    public async Task Refuses_a_picture_too_big_to_decode_safely_without_decoding_it()
    {
        // A PNG whose header says 20,000 × 20,000 (400 million pixels): a few bytes that would need 1.6 GB.
        var png = new List<byte>([0x89, (byte)'P', (byte)'N', (byte)'G', 0x0D, 0x0A, 0x1A, 0x0A]);
        var ihdr = new byte[17];
        "IHDR"u8.CopyTo(ihdr);
        BinaryPrimitives.WriteUInt32BigEndian(ihdr.AsSpan(4), 20_000);
        BinaryPrimitives.WriteUInt32BigEndian(ihdr.AsSpan(8), 20_000);
        ihdr[12] = 8;
        ihdr[13] = 6;
        png.AddRange([0, 0, 0, 13]);
        png.AddRange(ihdr);
        var crc = new byte[4];
        BinaryPrimitives.WriteUInt32BigEndian(crc, Crc32(ihdr));
        png.AddRange(crc);
        // Where the pixels would start (none follow): readers look this far for the size.
        foreach (var chunk in new[] { "IDAT"u8.ToArray(), "IEND"u8.ToArray() })
        {
            png.AddRange([0, 0, 0, 0]);
            png.AddRange(chunk);
            BinaryPrimitives.WriteUInt32BigEndian(crc, Crc32(chunk));
            png.AddRange(crc);
        }

        var error = await Assert.ThrowsAsync<NotAnImageException>(() => PrepareAsync([.. png]));
        Assert.Equal("20000×20000 is too big a picture.", error.Message);
    }

    [Fact]
    public void Leaves_an_upright_photo_as_it_is() =>
        Assert.Equal(SKMatrix.Identity, FileRules.Upright(SKEncodedOrigin.TopLeft, 40, 20));

    private static uint Crc32(byte[] bytes)
    {
        var crc = 0xFFFFFFFFu;
        foreach (var b in bytes)
        {
            crc ^= b;
            for (var k = 0; k < 8; k++) crc = (crc & 1) != 0 ? (crc >> 1) ^ 0xEDB88320u : crc >> 1;
        }
        return ~crc;
    }
}
