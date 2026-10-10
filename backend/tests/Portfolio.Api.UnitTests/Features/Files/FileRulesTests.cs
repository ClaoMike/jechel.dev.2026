using Portfolio.Api.Features.Files;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Metadata.Profiles.Exif;
using SixLabors.ImageSharp.PixelFormats;

namespace Portfolio.Api.UnitTests.Features.Files;

public class FileRulesTests
{
    private static MemoryStream Jpeg(int width, int height, bool withGps = false)
    {
        using var image = new Image<Rgb24>(width, height, new Rgb24(200, 100, 50));
        if (withGps)
        {
            image.Metadata.ExifProfile = new ExifProfile();
            image.Metadata.ExifProfile.SetValue(ExifTag.GPSLatitudeRef, "N");
            image.Metadata.ExifProfile.SetValue(ExifTag.Orientation, (ushort)6); // rotated 90°: stored sideways
        }
        var stream = new MemoryStream();
        image.SaveAsJpeg(stream);
        stream.Position = 0;
        return stream;
    }

    [Fact]
    public async Task A_large_photo_becomes_a_webp_that_fits_800_pixels()
    {
        var webp = await FileRules.PreparePhotoAsync(Jpeg(2000, 1000), CancellationToken.None);

        using var image = Image.Load(webp);
        Assert.Equal("image/webp", image.Metadata.DecodedImageFormat!.DefaultMimeType);
        Assert.Equal((800, 400), (image.Width, image.Height));
    }

    [Fact]
    public async Task A_small_photo_is_not_enlarged()
    {
        var webp = await FileRules.PreparePhotoAsync(Jpeg(300, 200), CancellationToken.None);

        using var image = Image.Load(webp);
        Assert.Equal((300, 200), (image.Width, image.Height));
    }

    [Fact]
    public async Task The_photo_is_turned_upright_and_loses_its_metadata()
    {
        var webp = await FileRules.PreparePhotoAsync(Jpeg(400, 200, withGps: true), CancellationToken.None);

        using var image = Image.Load(webp);
        Assert.Equal((200, 400), (image.Width, image.Height));
        Assert.Null(image.Metadata.ExifProfile);
    }

    [Fact]
    public async Task Bytes_that_are_not_an_image_are_rejected()
    {
        await Assert.ThrowsAnyAsync<ImageFormatException>(() =>
            FileRules.PreparePhotoAsync(new MemoryStream("%PDF-1.7 not an image"u8.ToArray()), CancellationToken.None));
    }

    [Fact]
    public async Task Only_jpeg_png_webp_and_gif_are_read()
    {
        using var image = new Image<Rgb24>(10, 10);
        var tiff = new MemoryStream();
        image.SaveAsTiff(tiff);
        tiff.Position = 0;

        await Assert.ThrowsAnyAsync<ImageFormatException>(() => FileRules.PreparePhotoAsync(tiff, CancellationToken.None));
    }

    [Fact]
    public async Task A_png_is_read()
    {
        using var image = new Image<Rgb24>(10, 10);
        var png = new MemoryStream();
        image.SaveAsPng(png);
        png.Position = 0;

        Assert.NotEmpty(await FileRules.PreparePhotoAsync(png, CancellationToken.None));
    }

    [Theory]
    [InlineData("%PDF-1.7\n...", true)]
    [InlineData("<html>", false)]
    [InlineData("", false)]
    public void A_pdf_starts_with_its_signature(string start, bool isPdf)
    {
        Assert.Equal(isPdf, FileRules.LooksLikePdf(System.Text.Encoding.ASCII.GetBytes(start)));
    }

    [Theory]
    [InlineData("Claudiu Jechel CV.pdf", "Claudiu Jechel CV.pdf")]
    [InlineData("C:\\Users\\me\\CV final.PDF", "CV final.pdf")]
    [InlineData("../../etc/passwd", "passwd.pdf")]
    [InlineData("\"quoted\"<name>.pdf", "quotedname.pdf")]
    [InlineData("", "Resume.pdf")]
    [InlineData(null, "Resume.pdf")]
    [InlineData("...", "Resume.pdf")]
    public void Uploaded_names_are_cleaned(string? name, string expected)
    {
        Assert.Equal(expected, FileRules.CleanFileName(name, "Resume", ".pdf"));
    }

    [Fact]
    public void Long_names_are_cut_to_fit()
    {
        var name = FileRules.CleanFileName(new string('a', 300) + ".pdf", "Resume", ".pdf");

        Assert.Equal(FileRules.FileNameMaxLength, name.Length);
        Assert.EndsWith(".pdf", name);
    }

    [Fact]
    public void File_urls_round_trip_to_their_id()
    {
        var id = Guid.NewGuid();

        Assert.Equal(id, FileRules.FileIdIn(FileRules.UrlFor(id, "My CV.pdf")));
        Assert.Equal("/api/files/" + id + "/My%20CV.pdf", FileRules.UrlFor(id, "My CV.pdf"));
        Assert.Null(FileRules.FileIdIn("/resume.pdf"));
        Assert.Null(FileRules.FileIdIn("https://example.com/api/files/" + id + "/x"));
        Assert.Null(FileRules.FileIdIn(""));
    }
}
