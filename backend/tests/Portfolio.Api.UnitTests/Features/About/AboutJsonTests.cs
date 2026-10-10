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
        Assert.Equal("", page.Experience[0].CompanyUrl);
        Assert.Equal("", page.Education[0].InstitutionUrl);
        Assert.Equal(new Qualification("Azure Developer Associate", "", null, ""), page.Qualifications[0]);
    }
}
