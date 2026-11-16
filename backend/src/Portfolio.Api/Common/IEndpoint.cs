using System.Reflection;

namespace Portfolio.Api.Common;

/// <summary>
/// One slice of a feature (vertical slice architecture): a single endpoint with everything it needs, its route, its
/// request and response, and its handler. <see cref="Map"/> adds the route under /api; the app finds every slice
/// itself (<see cref="EndpointDiscovery.MapEndpoints"/>), so a new endpoint is a new class in its feature's folder.
/// </summary>
public interface IEndpoint
{
    static abstract void Map(IEndpointRouteBuilder app);
}

public static class EndpointDiscovery
{
    /// <summary>Every slice (<see cref="IEndpoint"/>) in the assembly, by name.</summary>
    public static IReadOnlyList<Type> Slices(Assembly assembly) =>
        [.. assembly.GetTypes().Where(t => t is { IsAbstract: false, IsInterface: false } && typeof(IEndpoint).IsAssignableFrom(t)).OrderBy(t => t.FullName, StringComparer.Ordinal)];

    /// <summary>Maps every slice of the API's assembly.</summary>
    public static IEndpointRouteBuilder MapEndpoints(this IEndpointRouteBuilder app)
    {
        foreach (var slice in Slices(typeof(IEndpoint).Assembly))
        {
            slice.GetMethod(nameof(IEndpoint.Map), BindingFlags.Public | BindingFlags.Static, [typeof(IEndpointRouteBuilder)])!.Invoke(null, [app]);
        }
        return app;
    }
}
