using Portfolio.Api.Features.About;

namespace Portfolio.Api.UnitTests.Features.About;

public class AboutJsonTests
{
    [Fact]
    public void A_saved_page_reads_back_the_same()
    {
        var json = AboutJson.Serialize(AboutDefaults.Content);

        var read = AboutJson.Deserialize(json);

        Assert.Equal(json, AboutJson.Serialize(read));
    }

    [Fact]
    public void A_page_saved_before_periods_colours_places_and_dated_qualifications_is_upgraded()
    {
        // The shape the API stored before these fields existed.
        const string json = """
            {
              "photoUrl": "/me.jpg",
              "links": { "resumeUrl": "", "gitHubUrl": "https://github.com/x", "linkedInUrl": "", "instagramUrl": "" },
              "skills": [ { "name": "C#", "level": 90 } ],
              "experience": [ { "title": "Dev", "company": "Co", "location": "", "start": "2020-01-01", "end": null, "bullets": ["Did it"] } ],
              "education": [ { "title": "BSc", "institution": "Uni", "location": "", "start": "2015-10-01", "end": "2019-06-01" } ],
              "papers": ["A paper"],
              "qualifications": ["Azure Developer Associate"]
            }
            """;

        var page = AboutJson.Deserialize(json);

        Assert.Equal("/me.jpg", page.PhotoUrl);
        Assert.Equal("C#", page.Skills[0].Name);
        Assert.Empty(page.Skills[0].Periods);
        Assert.Equal(AboutDefaults.Colors.Skills, page.Colors.Skills);
        Assert.Equal(AboutDefaults.Colors.Places, page.Colors.Places);
        Assert.Empty(page.Places);
        Assert.Equal("Co", page.Experience[0].Company);
        Assert.Equal(new Qualification("Azure Developer Associate", "", null, ""), page.Qualifications[0]);
        Assert.Equal([new Paper("A paper", "")], page.Papers);
        Assert.Empty(page.Statuses);
        Assert.Empty(page.Languages);
        Assert.Empty(page.Licences);
        Assert.Empty(page.Hackathons);
        Assert.Empty(AboutRules.Validate(page));
    }

    [Fact]
    public void A_company_or_institution_website_becomes_a_link_in_its_name()
    {
        const string json = """
            {
              "photoUrl": "", "links": { "resumeUrl": "", "gitHubUrl": "", "linkedInUrl": "", "instagramUrl": "" },
              "skills": [], "papers": [], "qualifications": [],
              "experience": [
                { "title": "Dev", "company": "Acme [UK]", "companyUrl": " https://acme.example ", "location": "", "start": "2020-01-01", "end": null, "bullets": [] },
                { "title": "Dev", "company": "Globex", "companyUrl": "", "location": "", "start": "2020-01-01", "end": null, "bullets": [] },
                { "title": "Dev", "company": "Evil", "companyUrl": "javascript:alert(1)", "location": "", "start": "2020-01-01", "end": null, "bullets": [] }
              ],
              "education": [ { "title": "BSc", "institution": "Uni", "institutionUrl": "https://uni.example", "location": "", "start": "2015-10-01", "end": null } ]
            }
            """;

        var page = AboutJson.Deserialize(json);

        Assert.Equal(["[Acme UK](https://acme.example)", "Globex", "Evil"], page.Experience.Select(e => e.Company));
        Assert.Equal("[Uni](https://uni.example)", page.Education[0].Institution);
        Assert.Empty(AboutRules.Validate(page));
    }
}
