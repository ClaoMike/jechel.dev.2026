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

/// <summary>What the API returns: the terms, and when they last changed (the defaults have their own date, TermsDefaults.UpdatedAt).</summary>
/// <param name="UpdatedAt">Visitors accept a version of the terms: when this changes, they're asked again.</param>
public record TermsDocument(string Title, string Intro, IReadOnlyList<TermsSection> Sections, DateTimeOffset? UpdatedAt)
{
    public static TermsDocument From(TermsContent content, DateTimeOffset? updatedAt) => new(content.Title, content.Intro, content.Sections, updatedAt);
}

/// <summary>
/// Shown until the admin saves the terms for the first time. A starting point written from what the site
/// actually records (Features/Analytics, the contact form, meetings, updates, donations), not legal advice.
/// </summary>
public static class TermsDefaults
{
    /// <summary>
    /// When these defaults last changed: shown as "Last updated", and the version visitors accept. Move it
    /// whenever the text below changes, so everyone is asked to accept the new terms.
    /// </summary>
    public static readonly DateTimeOffset UpdatedAt = new(2026, 10, 22, 13, 0, 0, TimeSpan.Zero);

    /// <summary>How long a visit's record is kept (AnalyticsRetention deletes older ones).</summary>
    public const int VisitRetentionMonths = 12;

    private static TermsBlock Paragraph(string text) => new(TermsBlockKinds.Paragraph, text, []);
    private static TermsBlock Bullets(params string[] items) => new(TermsBlockKinds.Bullets, "", items);

    public static readonly TermsContent Content = new(
        Title: "Terms and Conditions",
        Intro: "These terms apply to everyone who visits jechel.dev. They cover how you may use the website, what it records when you visit, and what happens to anything you send through it. By ticking the box and continuing, you agree to them. If you don't agree, please don't use the website.",
        Sections:
        [
            new TermsSection("Who runs this website",
            [
                Paragraph("jechel.dev is the personal portfolio of Claudiu Mihai Jechel, an individual in the United Kingdom, not a company. It shows my apps, videos and experience, and ways to get in touch."),
                Paragraph("For the personal data described in these terms, I am the controller under UK data protection law. To ask about it, or about anything in these terms, write to me through the [Contact](/contact) page."),
            ]),
            new TermsSection("Using the website",
            [
                Paragraph("You may browse the website and share links to it. When you use it, you agree not to:"),
                Bullets(
                    "try to get into parts of the website that aren't meant for you, such as the admin area;",
                    "disrupt the website, for example by overloading it with automated requests;",
                    "send unlawful, abusive or misleading messages through it;",
                    "copy the website's content and present it as your own."),
            ]),
            new TermsSection("Content and intellectual property",
            [
                Paragraph("Unless stated otherwise, the text, images, videos and code shown on the website belong to me. Names and logos of other products and companies belong to their owners."),
                Paragraph("You may quote small parts of the content with a link back to the website."),
            ]),
            new TermsSection("What is recorded when you visit",
            [
                Paragraph("Once you've accepted these terms, the website records how it is used, so that I can see which parts are read and find and fix errors. Nothing is recorded before you accept, and nothing is recorded for the site owner's own visits. This is what a visit's record holds:"),
                Bullets(
                    "the pages you open, and when;",
                    "what you click: the words on the button or link (never what you type into a form), the address of a link, and whether a box is ticked; clicking into a YouTube video is recorded too, but not what you do inside it;",
                    "the fields you change: for a list, the option you pick; for a text box, only that you edited it, never what you typed; and when you send a form;",
                    "pressing Escape, which closes popups, and copying text from a page (not what you copied);",
                    "how far down each page you scroll, when you switch to another tab and come back, and when you leave;",
                    "playing, pausing and finishing a video in an app's gallery, swiping between its images and videos, and zooming, moving or looking at places on the map;",
                    "what you do with the forms: whether a message was sent, a subscription made, confirmed or cancelled, and why it didn't work if it didn't (for example a missing field, never its content);",
                    "errors on the page: what went wrong, where, and the technical details needed to fix it, such as a file that didn't load;",
                    "the theme you use, and when you switch themes;",
                    "the address of the page that brought you here (the referrer), and any campaign tags in the link you followed (utm_source, utm_medium, utm_campaign);",
                    "your browser's description of itself (the user agent: browser, operating system, type of device), its language and time zone, and the size of your screen and window;",
                    "the country you are in, worked out by Cloudflare from your IP address."),
                Paragraph("Your IP address itself is not stored. To count visitors without knowing who they are, it is combined with your browser's description and a random value that changes every day and is never stored. The result can't be turned back into your IP address, and the same visitor gets a different one the next day."),
                Paragraph("A visit is tied together by a random number kept in your browser's session storage, which is cleared when you close the tab. No cookies are used for this, nothing follows you to other websites, and the records are never used for advertising, sold, or combined with data from elsewhere."),
                Paragraph("Visit records are deleted automatically 12 months after the visit. I can also delete a single visit, for example if you ask."),
                Paragraph("Why: I have a legitimate interest in understanding how the website is used and keeping it working. You can object at any time through the [Contact](/contact) page."),
            ]),
            new TermsSection("What your browser keeps",
            [
                Paragraph("The website doesn't set cookies for visitors (the only cookies are for the site owner's sign-in). It keeps a few small things in your browser's storage, which never leave your browser except as described above:"),
                Bullets(
                    "that you accepted these terms, and which version (local storage, \"terms.accepted\");",
                    "the theme you chose, and whether the animated background was too slow on your device (local storage, \"theme\" and \"theme.slowDevice\");",
                    "which sections of the About Me page you folded away (local storage, \"about.collapsed.…\");",
                    "where you had scrolled to on each page, until you close the tab (session storage, \"scroll.positions\");",
                    "the random number of your visit, until you close the tab (session storage, \"analytics.session\")."),
                Paragraph("You can clear all of these at any time in your browser's settings."),
            ]),
            new TermsSection("Messages you send",
            [
                Paragraph("When you send a message through the contact form, the name, email address and message you enter are stored, with the time it arrived, so that I can read and answer it. The same goes for an email you send to the website's address: your name and address as your email gives them, its subject and its text (attachments aren't kept)."),
                Bullets(
                    "I'm notified on my phone with your name and message.",
                    "If I reply, the reply is emailed to you with your message quoted. If you answer it, your answer is stored with the conversation in the same way.",
                    "Your details are used only to answer you. They are not sold or shared with anyone else, apart from the services below that deliver them.",
                    "Messages are kept until I delete them. You can ask for yours to be deleted at any time."),
                Paragraph("Why: to answer you, which is what you asked for, and my legitimate interest in keeping a record of the conversation."),
            ]),
            new TermsSection("Booking a meeting",
            [
                Paragraph("Meetings are by invitation: if I invite you, my reply includes a link to book a time on Cal.com. What you enter there goes to Cal.com, under its own terms and privacy policy. Cal.com then tells this website the meeting's time and your name, email address, time zone and any notes you added, so that I can accept or decline it, email you about it and be reminded of it on my phone."),
                Paragraph("Meeting records are kept until I delete them. You can ask for yours to be deleted at any time."),
            ]),
            new TermsSection("Email updates",
            [
                Paragraph("If you sign up for updates, your email address is stored with a random code for confirming and unsubscribing, and when you signed up and confirmed. You are sent a confirmation email first, then an email for each new app or video. I'm notified on my phone when someone subscribes. An address that isn't confirmed within 7 days is deleted."),
                Paragraph("Every email has an unsubscribe link: using it deletes your address straight away. Why: you asked for the updates (your consent), which you can withdraw at any time by unsubscribing."),
            ]),
            new TermsSection("Buy me a coffee",
            [
                Paragraph("The \"Buy me a coffee\" button takes you to buymeacoffee.com, where any payment happens under its own terms. Buy Me a Coffee then tells this website the supporter's name, message, amount and currency, and the email address if one was shared, which are kept as a record of the support. You can ask for yours to be deleted at any time."),
            ]),
            new TermsSection("Services that help run the website",
            [
                Paragraph("Some of the information above passes through these services, which handle it for me under their own terms:"),
                Bullets(
                    "Cloudflare, which delivers the website: your IP address passes through it so that the pages reach you, and it tells the website which country you are in;",
                    "Sliplane, which runs the website's server, database and its backups, in Germany;",
                    "Resend, which sends the website's emails;",
                    "ntfy.sh, which sends notifications to my phone (they can include a sender's name and message, a subscriber's email address or a meeting's details);",
                    "YouTube: videos play in YouTube's privacy-enhanced player (youtube-nocookie.com), which may store information in your browser once you play a video, and thumbnails come from YouTube's servers, which see your IP address;",
                    "Cal.com and Buy Me a Coffee, as described above;",
                    "Google, only for the site owner's own sign-in;",
                    "other websites that an app's images and videos may come from (the Apps page can show them from elsewhere), which see your IP address when they load."),
                Paragraph("Some of these services may handle information outside the United Kingdom. They protect it under their own terms, with the safeguards UK law requires."),
            ]),
            new TermsSection("Your rights",
            [
                Paragraph("Under UK data protection law you can ask for a copy of the personal data held about you, and for it to be corrected or deleted. You can also ask me to stop using it, or object to how it's used, including the recording of your visits. Write to me through the [Contact](/contact) page."),
                Paragraph("A visit's record isn't tied to your name, so to find yours I may need to know roughly when you visited and from which browser or device."),
                Paragraph("If you're unhappy with how your data is handled, you can complain to the Information Commissioner's Office, [ico.org.uk](https://ico.org.uk)."),
            ]),
            new TermsSection("Other websites",
            [
                Paragraph("The website links to and embeds content from other websites, such as YouTube, GitHub and LinkedIn, and the stores where my apps are offered, such as the App Store, Google Play and Steam. Those websites have their own terms and privacy policies, and I am not responsible for their content. Anything you buy or download there is between you and that store."),
            ]),
            new TermsSection("No warranty",
            [
                Paragraph("The website is provided as it is. I try to keep it accurate and available, but I can't promise that it will always be correct, complete or online. As far as the law allows, I'm not responsible for any loss that comes from using it. Nothing in these terms limits anything that, by law, can't be limited."),
            ]),
            new TermsSection("Law",
            [
                Paragraph("These terms are governed by the law of England and Wales."),
            ]),
            new TermsSection("Changes to these terms",
            [
                Paragraph("These terms may change from time to time. The date at the top shows when they last changed. When they change, you'll be asked to accept them again before you continue."),
            ]),
        ]);
}
