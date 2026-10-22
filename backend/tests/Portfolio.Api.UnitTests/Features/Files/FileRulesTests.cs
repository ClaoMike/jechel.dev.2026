using Portfolio.Api.Features.Files;

namespace Portfolio.Api.UnitTests.Features.Files;

public class FileRulesTests
{
    // Photos (PreparePhotoAsync) are tested in PreparePhotoTests.

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

    [Theory]
    [InlineData(new byte[] { 0, 0, 0, 0x20, (byte)'f', (byte)'t', (byte)'y', (byte)'p', (byte)'i', (byte)'s', (byte)'o', (byte)'m' }, "video/mp4")]
    [InlineData(new byte[] { 0, 0, 0, 0x14, (byte)'f', (byte)'t', (byte)'y', (byte)'p', (byte)'q', (byte)'t', (byte)' ', (byte)' ' }, "video/quicktime")]
    [InlineData(new byte[] { 0x1A, 0x45, 0xDF, 0xA3, 0, 0, 0, 0, 0, 0, 0, 0 }, "video/webm")]
    [InlineData(new byte[] { 0, 0, 0, 0x18, (byte)'f', (byte)'t', (byte)'y', (byte)'p', (byte)'h', (byte)'e', (byte)'i', (byte)'c' }, null)]
    [InlineData(new byte[] { 0x89, (byte)'P', (byte)'N', (byte)'G', 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 0 }, null)]
    [InlineData(new byte[] { 1, 2 }, null)]
    public void Videos_are_recognised_by_their_first_bytes(byte[] start, string? contentType)
    {
        Assert.Equal(contentType, FileRules.VideoContentType(start));
    }

    // Photos from phones (HEIC, AVIF) are "ftyp" files too, but not videos: they're refused here, then read as images (or not).
    [Theory]
    [InlineData("heic")]
    [InlineData("heix")]
    [InlineData("heim")]
    [InlineData("heis")]
    [InlineData("hevc")]
    [InlineData("hevx")]
    [InlineData("mif1")]
    [InlineData("msf1")]
    [InlineData("avif")]
    [InlineData("avis")]
    public void Pictures_in_a_video_container_arent_videos(string brand)
    {
        byte[] start = [0, 0, 0, 0x18, .. "ftyp"u8, .. System.Text.Encoding.ASCII.GetBytes(brand)];

        Assert.Null(FileRules.VideoContentType(start));
    }

    [Theory]
    [InlineData("video/mp4", ".mp4")]
    [InlineData("video/quicktime", ".mov")]
    [InlineData("video/webm", ".webm")]
    public void A_video_keeps_the_extension_of_its_kind(string contentType, string extension) =>
        Assert.Equal(extension, FileRules.VideoExtension(contentType));
}
