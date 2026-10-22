using Portfolio.Api.Features.Terms;

namespace Portfolio.Api.UnitTests.Features.Terms;

public class TermsRulesTests
{
    private static TermsBlock Paragraph(string text) => new(TermsBlockKinds.Paragraph, text, []);
    private static TermsBlock Bullets(params string[] items) => new(TermsBlockKinds.Bullets, "", items);

    private static TermsContent WithBlocks(params TermsBlock[] blocks) => new("Terms", "", [new TermsSection("Use", blocks)]);

    [Fact]
    public void The_default_terms_are_valid()
    {
        Assert.Empty(TermsRules.Validate(TermsDefaults.Content));
    }

    [Fact]
    public void Title_and_headings_are_required()
    {
        var errors = TermsRules.Validate(new TermsContent(" ", "", [new TermsSection("", [])]));

        Assert.Equal(["sections[0].heading", "title"], errors.Keys.Order());
    }

    [Fact]
    public void Paragraphs_need_text_and_lists_need_a_bullet_point()
    {
        var errors = TermsRules.Validate(WithBlocks(Paragraph("  "), Bullets("", " "), Bullets()));

        Assert.Equal(["sections[0].blocks[0].text", "sections[0].blocks[1].items", "sections[0].blocks[2].items"], errors.Keys.Order());
    }

    [Fact]
    public void Unknown_block_kinds_are_rejected()
    {
        var errors = TermsRules.Validate(WithBlocks(new TermsBlock("table", "x", [])));

        Assert.Equal(["sections[0].blocks[0].kind"], errors.Keys);
    }

    [Fact]
    public void Links_must_be_safe()
    {
        var errors = TermsRules.Validate(new TermsContent("Terms", "[click](javascript:alert(1))", [new TermsSection("Use", [Bullets("[ok](https://example.com)", "[bad](data:text/html,x)")])]));

        Assert.Equal(["intro", "sections[0].blocks[0].items[1]"], errors.Keys.Order());
    }

    [Fact]
    public void Too_long_text_is_rejected()
    {
        var errors = TermsRules.Validate(WithBlocks(Paragraph(new string('a', TermsRules.TextMaxLength + 1)), Bullets(new string('b', TermsRules.ItemMaxLength + 1))));

        Assert.Equal(["sections[0].blocks[0].text", "sections[0].blocks[1].items[0]"], errors.Keys.Order());
    }

    [Fact]
    public void Missing_lists_are_rejected()
    {
        var errors = TermsRules.Validate(new TermsContent("Terms", "", null!));

        Assert.Equal(["sections"], errors.Keys);
    }

    [Fact]
    public void Normalize_trims_drops_empty_bullet_points_and_keeps_only_the_field_each_block_uses()
    {
        var content = new TermsContent(" Terms ", " Hello ", [new TermsSection(" Use ", [new TermsBlock(TermsBlockKinds.Paragraph, " Text ", ["stray"]), new TermsBlock(TermsBlockKinds.Bullets, "stray", [" a ", "", " b"])])]);

        var normalized = TermsRules.Normalize(content);

        Assert.Equal(("Terms", "Hello", "Use"), (normalized.Title, normalized.Intro, normalized.Sections[0].Heading));
        var blocks = normalized.Sections[0].Blocks;
        Assert.Equal(("Text", 0), (blocks[0].Text, blocks[0].Items.Count));
        Assert.Equal("", blocks[1].Text);
        Assert.Equal(["a", "b"], blocks[1].Items);
    }

    // ---------- A request with holes (JSON nulls): each is a field error, never a crash ----------

    [Fact]
    public void No_terms_at_all_is_one_error()
    {
        Assert.Equal("The terms are required.", TermsRules.Validate(null)[""].Single());
    }

    [Fact]
    public void A_missing_section_block_or_list_is_named()
    {
        var content = new TermsContent("Terms", null!, [null!, new TermsSection("Use", null!), new TermsSection("More", [null!, new TermsBlock(TermsBlockKinds.Bullets, "", null!)])]);

        var errors = TermsRules.Validate(content);

        Assert.Equal("Section is required.", errors["sections[0]"].Single());
        Assert.Equal("Required (can be empty).", errors["sections[1].blocks"].Single());
        Assert.Equal("Required.", errors["sections[2].blocks[0]"].Single());
        Assert.Equal("Required (can be empty).", errors["sections[2].blocks[1].items"].Single());
        Assert.DoesNotContain("intro", errors.Keys);
    }

    [Fact]
    public void Too_many_sections_or_bullets_are_refused()
    {
        var many = new TermsContent("Terms", "", [.. Enumerable.Range(0, TermsRules.MaxSections + 1).Select(i => new TermsSection($"S{i}", [Paragraph("Text")]))]);
        var bullets = WithBlocks(Bullets([.. Enumerable.Range(0, TermsRules.MaxItems + 1).Select(i => $"Item {i}")]));

        Assert.Equal($"At most {TermsRules.MaxSections} items.", TermsRules.Validate(many)["sections"].Single());
        Assert.Equal($"At most {TermsRules.MaxItems} items.", TermsRules.Validate(bullets)["sections[0].blocks[0].items"].Single());
    }

    [Fact]
    public void Tidying_treats_a_missing_intro_or_bullet_as_empty()
    {
        var content = new TermsContent(" Terms ", null!, [new TermsSection("Use", [Bullets(null!, " One ", "")])]);

        var tidy = TermsRules.Normalize(content);

        Assert.Equal(("Terms", ""), (tidy.Title, tidy.Intro));
        Assert.Equal(["One"], tidy.Sections[0].Blocks[0].Items);
    }
}
