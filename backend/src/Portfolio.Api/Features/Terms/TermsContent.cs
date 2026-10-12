namespace Portfolio.Api.Features.Terms;

/// <summary>
/// The terms and conditions: a title, an introduction, then numbered sections. Free text may
/// contain links written as [text](https://…), like the About Me page.
/// </summary>
public record TermsContent(string Title, string Intro, IReadOnlyList<TermsSection> Sections);

/// <summary>A numbered section: a heading, then paragraphs and bullet lists in the order given.</summary>
public record TermsSection(string Heading, IReadOnlyList<TermsBlock> Blocks);

/// <summary>A paragraph (<see cref="Text"/>) or a bullet list (<see cref="Items"/>); the other one is empty.</summary>
/// <param name="Kind">One of <see cref="TermsBlockKinds"/>.</param>
public record TermsBlock(string Kind, string Text, IReadOnlyList<string> Items);

public static class TermsBlockKinds
{
    public const string Paragraph = "paragraph";
    public const string Bullets = "bullets";
    public static readonly IReadOnlyList<string> All = [Paragraph, Bullets];
}

/// <summary>What the API returns: the terms, and when they last changed (null until the admin first saves them).</summary>
/// <param name="UpdatedAt">Visitors accept a version of the terms: when this changes, they're asked again.</param>
public record TermsDocument(string Title, string Intro, IReadOnlyList<TermsSection> Sections, DateTimeOffset? UpdatedAt)
{
    public static TermsDocument From(TermsContent content, DateTimeOffset? updatedAt) => new(content.Title, content.Intro, content.Sections, updatedAt);
}

/// <summary>Shown until the admin saves the terms for the first time. A starting point, not legal advice.</summary>
public static class TermsDefaults
{
    private static TermsBlock Paragraph(string text) => new(TermsBlockKinds.Paragraph, text, []);
    private static TermsBlock Bullets(params string[] items) => new(TermsBlockKinds.Bullets, "", items);

    public static readonly TermsContent Content = new(
        Title: "Terms and Conditions",
        Intro: "These terms apply to everyone who visits jechel.dev. By using the website you agree to them, so please read them carefully. If you don't agree, please don't use the website.",
        Sections:
        [
            new TermsSection("About this website",
            [
                Paragraph("jechel.dev is a personal portfolio. It shows my apps, videos, experience and a way to get in touch. It is run by an individual, not a company."),
            ]),
            new TermsSection("Using the website",
            [
                Paragraph("You may browse the website and share links to it. When you use it, you agree not to:"),
                Bullets(
                    "try to get into parts of the website that aren't meant for you, such as the admin area;",
                    "disrupt the website, for example by overloading it with automated requests;",
                    "send unlawful, abusive or misleading messages through the contact form;",
                    "copy the website's content and present it as your own."),
            ]),
            new TermsSection("Content and intellectual property",
            [
                Paragraph("Unless stated otherwise, the text, images, videos and code shown on the website belong to me. Names and logos of other products and companies belong to their owners."),
                Paragraph("You may quote small parts of the content with a link back to the website."),
            ]),
            new TermsSection("Messages you send",
            [
                Paragraph("When you send a message through the contact form, the name, email address and message you enter are stored so that I can read and answer them."),
                Bullets(
                    "Your details are used only to reply to you.",
                    "They are not sold or shared with anyone else.",
                    "You can ask for your message to be deleted at any time."),
            ]),
            new TermsSection("Other websites",
            [
                Paragraph("The website links to and embeds content from other websites, such as YouTube, GitHub and LinkedIn. Those websites have their own terms and privacy policies, and I am not responsible for their content."),
            ]),
            new TermsSection("No warranty",
            [
                Paragraph("The website is provided as it is. I try to keep it accurate and available, but I can't promise that it will always be correct, complete or online."),
            ]),
            new TermsSection("Changes to these terms",
            [
                Paragraph("These terms may change from time to time. The date at the top shows when they last changed. When they change, you'll be asked to accept them again."),
            ]),
        ]);
}
