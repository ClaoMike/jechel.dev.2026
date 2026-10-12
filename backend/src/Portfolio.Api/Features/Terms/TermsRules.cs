using Portfolio.Api.Features.About;

namespace Portfolio.Api.Features.Terms;

/// <summary>
/// Validation and normalisation of the terms. Error keys are the JSON paths of the fields, e.g.
/// "sections[0].blocks[1].items[2]", so the editor can show them next to the right input.
/// </summary>
public static class TermsRules
{
    public const int TitleMaxLength = 200;
    public const int HeadingMaxLength = 300;
    public const int TextMaxLength = 5000;
    public const int ItemMaxLength = 1000;
    public const int MaxSections = 50;
    public const int MaxBlocks = 30;
    public const int MaxItems = 50;

    public static Dictionary<string, string[]> Validate(TermsContent? content)
    {
        var errors = new Dictionary<string, string[]>();
        void Add(string key, string message) => errors[key] = [message];

        if (content is null)
        {
            Add("", "The terms are required.");
            return errors;
        }

        CheckText(content.Title, "title", TitleMaxLength, Add);
        CheckText(content.Intro, "intro", TextMaxLength, Add, required: false);

        if (!CheckList(content.Sections, "sections", MaxSections, Add)) return errors;
        for (var s = 0; s < content.Sections.Count; s++)
        {
            var section = content.Sections[s];
            var key = $"sections[{s}]";
            if (section is null) { Add(key, "Section is required."); continue; }
            CheckText(section.Heading, $"{key}.heading", HeadingMaxLength, Add);
            if (!CheckList(section.Blocks, $"{key}.blocks", MaxBlocks, Add)) continue;
            for (var b = 0; b < section.Blocks.Count; b++)
            {
                var block = section.Blocks[b];
                var blockKey = $"{key}.blocks[{b}]";
                if (block is null) { Add(blockKey, "Required."); continue; }
                switch (block.Kind)
                {
                    case TermsBlockKinds.Paragraph:
                        CheckText(block.Text, $"{blockKey}.text", TextMaxLength, Add);
                        break;
                    case TermsBlockKinds.Bullets:
                        if (!CheckList(block.Items, $"{blockKey}.items", MaxItems, Add)) break;
                        if (block.Items.All(string.IsNullOrWhiteSpace)) { Add($"{blockKey}.items", "Add at least one bullet point."); break; }
                        for (var i = 0; i < block.Items.Count; i++)
                        {
                            CheckText(block.Items[i], $"{blockKey}.items[{i}]", ItemMaxLength, Add, required: false);
                        }
                        break;
                    default:
                        Add($"{blockKey}.kind", $"Must be one of: {string.Join(", ", TermsBlockKinds.All)}.");
                        break;
                }
            }
        }

        return errors;
    }

    /// <summary>
    /// Trims text, drops empty bullet points, and keeps only the field each block uses (text for a
    /// paragraph, items for a list). Call only on content that passed <see cref="Validate"/>.
    /// </summary>
    public static TermsContent Normalize(TermsContent content) => new(
        content.Title.Trim(),
        content.Intro?.Trim() ?? "",
        [.. content.Sections.Select(s => new TermsSection(
            s.Heading.Trim(),
            [.. s.Blocks.Select(b => b.Kind == TermsBlockKinds.Paragraph
                ? new TermsBlock(b.Kind, b.Text.Trim(), [])
                : new TermsBlock(b.Kind, "", [.. b.Items.Select(i => i?.Trim() ?? "").Where(i => i.Length > 0)]))]))]);

    private static void CheckText(string? value, string key, int maxLength, Action<string, string> add, bool required = true)
    {
        var text = value?.Trim() ?? "";
        if (required && text.Length == 0) add(key, "Required.");
        else if (text.Length > maxLength) add(key, $"Must be at most {maxLength} characters.");
        else if (AboutRules.LinksIn(text).Any(url => !AboutRules.IsSafeUrl(url) || url.Length > AboutRules.UrlMaxLength)) add(key, "Links must be http(s) links, or paths on this site starting with /.");
    }

    private static bool CheckList<T>(IReadOnlyList<T>? list, string key, int max, Action<string, string> add)
    {
        if (list is null) { add(key, "Required (can be empty)."); return false; }
        if (list.Count > max) { add(key, $"At most {max} items."); return false; }
        return true;
    }
}
