using Microsoft.EntityFrameworkCore;
using __NAMESPACE__.Api.Data;
using __NAMESPACE__.Api.Features.Greetings;

namespace __NAMESPACE__.Api.UnitTests.Features.Greetings;

public class GetGreetingTests
{
    private readonly AppDbContext _db = new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    [Fact]
    public async Task Answers_the_first_greeting()
    {
        _db.Greetings.AddRange(new Greeting { Id = 2, Text = "Second" }, new Greeting { Id = 1, Text = "First" });
        await _db.SaveChangesAsync();

        var result = await GetGreeting.Handle(_db, default);

        Assert.Equal("First", result.Value!.Text);
    }

    [Fact]
    public async Task Says_hello_while_there_is_none()
    {
        var result = await GetGreeting.Handle(_db, default);

        Assert.Equal("Hello", result.Value!.Text);
    }
}
