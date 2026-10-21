using Portfolio.Api.Features.Alerts;
using Portfolio.Api.Features.Updates;

namespace Portfolio.Api.UnitTests.Features.Updates;

/// <summary>The admin's wording of the emails subscribers get: what it may say, and how the emails show it.</summary>
public class UpdateEmailWordingTests
{
    private static readonly SiteOptions Site = new() { PublicUrl = "https://jechel.dev" };
    private static readonly UpdateEmailWording Defaults = UpdateEmailDefaults.Wording;
    private static readonly UpdateItem Item = new("Space Game", "Dodge the asteroids.", "https://jechel.dev/apps", "https://jechel.dev/api/files/1/a.webp");
    private const string Unsubscribe = "https://jechel.dev/updates/unsubscribe?token=t";

    private static EmailMessage Confirmation(UpdateEmailWording wording) => UpdateEmails.Confirmation("ada@example.com", "c", wording, Site);
    private static EmailMessage NewItem(string kind, UpdateEmailWording wording, UpdateItem? item = null) => UpdateEmails.NewItem("ada@example.com", kind, item ?? Item, "t", wording, Site);

    private static string[] ErrorKeys(UpdateEmailWording wording) => [.. UpdateEmailRules.Validate(wording).Keys.Order()];
    private static string Error(UpdateEmailWording wording, string key) => Assert.Single(UpdateEmailRules.Validate(wording)[key]);

    // ---------- What the wording may say ----------

    [Fact]
    public void The_defaults_are_valid_and_say_that_replies_arent_read()
    {
        Assert.Empty(UpdateEmailRules.Validate(Defaults));
        Assert.Contains("aren't read", Defaults.Footer.NoReply);
        Assert.Contains("(/contact)", Defaults.Footer.NoReply);
    }

    [Fact]
    public void Every_email_is_required()
    {
        Assert.Equal([""], ErrorKeys(null!));
        Assert.Equal([""], ErrorKeys(Defaults with { Video = null! }));
        Assert.Equal([""], ErrorKeys(Defaults with { Footer = null! }));
    }

    [Fact]
    public void Subjects_messages_and_buttons_are_required_the_notes_and_footer_are_not()
    {
        var empty = new UpdateEmailWording(new ConfirmWording(" ", "", "", ""), new ItemWording("", "", "", ""), new ItemWording("", " ", "", " "), new FooterWording("", ""));

        Assert.Equal(
            ["app.button", "app.intro", "app.subject", "confirm.button", "confirm.intro", "confirm.subject", "video.button", "video.intro", "video.subject"],
            ErrorKeys(empty));
        Assert.Equal("Required.", Error(empty, "confirm.subject"));
    }

    [Fact]
    public void Lines_stay_on_one_line_and_within_their_length()
    {
        var wording = Defaults with
        {
            Confirm = Defaults.Confirm with { Subject = "Two\nlines", Button = new string('b', UpdateEmailRules.ButtonMaxLength + 1) },
            Video = Defaults.Video with { Subject = new string('s', UpdateEmailRules.SubjectMaxLength + 1) },
            Footer = Defaults.Footer with { NoReply = new string('n', UpdateEmailRules.TextMaxLength + 1) },
        };

        Assert.Equal("Must be one line.", Error(wording, "confirm.subject"));
        Assert.Equal("Must be at most 40 characters.", Error(wording, "confirm.button"));
        Assert.Equal("Must be at most 150 characters.", Error(wording, "video.subject"));
        Assert.Equal("Must be at most 1000 characters.", Error(wording, "footer.noReply"));
        // A long text is not a line: it may have paragraphs.
        Assert.Empty(UpdateEmailRules.Validate(Defaults with { Confirm = Defaults.Confirm with { Intro = "One.\n\nTwo.\nThree." } }));
    }

    [Fact]
    public void Only_the_new_items_subject_and_message_can_hold_its_title()
    {
        Assert.Empty(UpdateEmailRules.Validate(Defaults with { App = new ItemWording("{title}!", "New:\n\n{title}", "Open", "") }));

        var wording = Defaults with
        {
            Confirm = Defaults.Confirm with { Subject = "Confirm {title}", Intro = "Hi {name}" },
            Video = new ItemWording("New", "{Title} is up", "Watch {title}", "About {title}"),
        };
        Assert.Equal("Nothing is filled in here; remove {title}.", Error(wording, "confirm.subject"));
        Assert.Equal("Nothing is filled in here; remove {name}.", Error(wording, "confirm.intro"));
        Assert.Equal("Only {title} can be filled in; remove {Title}.", Error(wording, "video.intro"));
        Assert.Equal("Nothing is filled in here; remove {title}.", Error(wording, "video.button"));
        Assert.Equal("Nothing is filled in here; remove {title}.", Error(wording, "video.note"));
    }

    [Fact]
    public void Links_lead_to_web_pages_or_this_sites_pages_only()
    {
        Assert.Empty(UpdateEmailRules.Validate(Defaults with { Footer = new FooterWording("See [the site](https://jechel.dev).", "Use [contact](/contact).") }));

        var wording = Defaults with { Confirm = Defaults.Confirm with { Note = "[Click](javascript:alert(1))" }, Footer = Defaults.Footer with { Reason = "[x](//evil.example)" } };
        Assert.Equal("Links must be http(s) links, or paths on this site starting with /.", Error(wording, "confirm.note"));
        Assert.Equal(["confirm.note", "footer.reason"], ErrorKeys(wording));
    }

    [Fact]
    public void Normalizing_trims_and_makes_windows_line_ends_plain()
    {
        var wording = Defaults with { Confirm = new ConfirmWording("  Hi  ", "One.\r\n\r\nTwo. ", " Yes ", " "), Footer = new FooterWording(" Why ", "\r\nNo replies.\r\n") };

        var clean = UpdateEmailRules.Normalize(wording);

        Assert.Equal(new ConfirmWording("Hi", "One.\n\nTwo.", "Yes", ""), clean.Confirm);
        Assert.Equal(new FooterWording("Why", "No replies."), clean.Footer);
        Assert.Equal(Defaults.Video, clean.Video);
    }

    // ---------- How the emails show it ----------

    [Fact]
    public void The_confirmation_says_what_the_admin_wrote_with_its_paragraphs_links_and_button()
    {
        var wording = Defaults with
        {
            Confirm = new ConfirmWording("Please confirm", "Hello there,\n\nOne click & you're in.\nPromise.", "Count me in", "Not you? See the [terms](/terms)."),
        };

        var email = Confirmation(wording);

        Assert.Equal("Please confirm", email.Subject);
        Assert.Contains("<p>Hello there,</p><p>One click &amp; you&#39;re in.<br>Promise.</p>", email.Html);
        Assert.Contains(">Count me in</a>", email.Html);
        Assert.Contains("href=\"https://jechel.dev/updates/confirm?token=c\"", email.Html);
        Assert.Contains("<a href=\"https://jechel.dev/terms\"", email.Html);
        Assert.Contains("Count me in: https://jechel.dev/updates/confirm?token=c", email.Text);
        Assert.Contains("Not you? See the terms (https://jechel.dev/terms).", email.Text);
    }

    [Fact]
    public void The_confirmation_has_the_no_reply_line_but_no_unsubscribe_link_nothing_to_unsubscribe_from_yet()
    {
        var email = Confirmation(Defaults);

        Assert.Contains("Replies to this address aren&#39;t read. To get in touch, use the <a href=\"https://jechel.dev/contact\"", email.Html);
        Assert.Contains("--\nReplies to this address aren't read. To get in touch, use the contact page (https://jechel.dev/contact).", email.Text);
        Assert.DoesNotContain("Unsubscribe", email.Html);
        Assert.Null(email.UnsubscribeUrl);
    }

    [Fact]
    public void A_new_video_or_app_fills_its_title_into_the_subject_and_message_in_each_ones_wording()
    {
        var wording = Defaults with
        {
            Video = new ItemWording("🎬 {title}", "Fresh from the channel:\n\n{title} is up.", "Play", "Made with [Unity](https://unity.com)."),
            App = new ItemWording("New app — {title}", "Just shipped", "Try it", ""),
        };

        var video = NewItem(UpdatesAnnouncer.VideoKind, wording);
        var app = NewItem(UpdatesAnnouncer.AppKind, wording);

        Assert.Equal("🎬 Space Game", video.Subject);
        Assert.Contains("<p>Fresh from the channel:</p><p>Space Game is up.</p>", video.Html);
        Assert.Contains(">Play</a>", video.Html);
        Assert.Contains("<a href=\"https://unity.com\" style=\"color:#b0106f\">Unity</a>", video.Html);
        Assert.StartsWith("Fresh from the channel:\n\nSpace Game is up.\n\nSpace Game\n\nDodge the asteroids.\n\nPlay: https://jechel.dev/apps\n\nMade with Unity (https://unity.com).", video.Text);
        Assert.Equal("New app — Space Game", app.Subject);
        Assert.Contains("<p>Just shipped</p>", app.Html);
        Assert.Contains("Try it: https://jechel.dev/apps", app.Text);
        Assert.DoesNotContain("Unity", app.Html);
    }

    [Fact]
    public void An_update_ends_with_why_they_get_it_how_to_unsubscribe_and_that_replies_arent_read()
    {
        var email = NewItem(UpdatesAnnouncer.AppKind, Defaults);

        Assert.Contains($"You get these because you subscribed on jechel.dev. <a href=\"{Unsubscribe}\"", email.Html);
        Assert.Contains("aren&#39;t read", email.Html);
        Assert.EndsWith(
            $"--\nYou get these because you subscribed on jechel.dev.\n\nUnsubscribe: {Unsubscribe}\n\nReplies to this address aren't read. To get in touch, use the contact page (https://jechel.dev/contact).",
            email.Text);
        // Mail apps' own Unsubscribe button posts to the API: a page can't take a POST.
        Assert.Equal("https://jechel.dev/api/updates/unsubscribe?token=t", email.UnsubscribeUrl);
    }

    [Fact]
    public void An_empty_footer_leaves_only_the_unsubscribe_link_which_is_always_there()
    {
        var wording = Defaults with { Footer = new FooterWording("", "") };

        var update = NewItem(UpdatesAnnouncer.VideoKind, wording);
        var confirmation = Confirmation(wording with { Confirm = Defaults.Confirm with { Note = "" } });

        Assert.Contains($"<p style=\"margin:0 0 8px\"><a href=\"{Unsubscribe}\"", update.Html);
        Assert.EndsWith($"--\nUnsubscribe: {Unsubscribe}", update.Text);
        Assert.DoesNotContain("--", confirmation.Text);
        Assert.DoesNotContain("aren't read", confirmation.Text);
    }

    [Fact]
    public void What_the_admin_wrote_and_what_the_item_says_are_encoded()
    {
        var wording = Defaults with { App = new ItemWording("<b>{title}</b>", "<img src=x onerror=alert(1)>", "<script>", "<style>") };

        var email = NewItem(UpdatesAnnouncer.AppKind, wording, Item with { Title = "<i>Game</i>", Summary = "Fish & chips" });

        Assert.DoesNotContain("<script>", email.Html);
        Assert.DoesNotContain("<img src=x", email.Html);
        Assert.DoesNotContain("<i>Game", email.Html);
        Assert.Contains("&lt;script&gt;", email.Html);
        Assert.Contains("&lt;style&gt;", email.Html);
        Assert.Contains("Fish &amp; chips", email.Html);
        // The subject is plain text: mail apps show it as written.
        Assert.Equal("<b><i>Game</i></b>", email.Subject);
    }

    [Fact]
    public void Every_email_has_the_jechel_dev_look_and_goes_out_from_the_updates_sender()
    {
        foreach (var email in new[] { Confirmation(Defaults), NewItem(UpdatesAnnouncer.VideoKind, Defaults), NewItem(UpdatesAnnouncer.AppKind, Defaults) })
        {
            Assert.True(email.FromUpdates);
            Assert.Null(email.ReplyTo);
            // The icon travels inside the email, so it shows even while the site isn't online.
            Assert.Contains("<img src=\"cid:jechel-icon\"", email.Html);
            Assert.Equal([UpdateEmails.Icon], email.Images);
            Assert.Contains(">jechel</span><span style=\"color:#b98cff;vertical-align:middle\">.dev</span>", email.Html);
            // Each gradient sits on a plain colour, for the mail apps that drop gradients.
            Assert.Contains("background-color:#d91289;background-image:linear-gradient(90deg,#d91289,#9942f0)", email.Html);
            Assert.Contains("<meta name=\"color-scheme\" content=\"light\">", email.Html);
        }
    }

    [Fact]
    public void An_update_shows_its_picture_linked_to_the_item_or_none()
    {
        var with = NewItem(UpdatesAnnouncer.AppKind, Defaults);
        var without = NewItem(UpdatesAnnouncer.AppKind, Defaults, Item with { ImageUrl = null });

        Assert.Contains("<a href=\"https://jechel.dev/apps\"><img src=\"https://jechel.dev/api/files/1/a.webp\"", with.Html);
        Assert.DoesNotContain("api/files", without.Html);
    }

    [Fact]
    public void The_icon_is_the_sites_own_png_small_enough_for_every_email()
    {
        Assert.Equal(("jechel-icon", "image/png"), (UpdateEmails.Icon.ContentId, UpdateEmails.Icon.ContentType));
        Assert.Equal([0x89, (byte)'P', (byte)'N', (byte)'G'], UpdateEmails.Icon.Content[..4]);
        Assert.InRange(UpdateEmails.Icon.Content.Length, 1_000, 20_000);
    }

    [Fact]
    public void For_a_browser_the_icon_is_written_into_the_html_since_browsers_cant_read_cid_links()
    {
        var html = UpdateEmails.ForBrowser(Confirmation(Defaults));

        Assert.DoesNotContain("cid:", html);
        Assert.Contains($"<img src=\"data:image/png;base64,{Convert.ToBase64String(UpdateEmails.Icon.Content)}\"", html);
    }

    [Fact]
    public void Codes_in_links_are_escaped()
    {
        var email = UpdateEmails.NewItem("ada@example.com", UpdatesAnnouncer.AppKind, Item, "a+b/c", Defaults, Site);

        Assert.Equal("https://jechel.dev/api/updates/unsubscribe?token=a%2Bb%2Fc", email.UnsubscribeUrl);
        Assert.Contains("https://jechel.dev/updates/unsubscribe?token=a%2Bb%2Fc", email.Text);
    }
}
