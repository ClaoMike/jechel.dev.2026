using System.Text.Json;

namespace Portfolio.Api.Features.Terms;

public static class TermsShared
{
    internal static readonly JsonSerializerOptions Json = JsonSerializerOptions.Web;
}
