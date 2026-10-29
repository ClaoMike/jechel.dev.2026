namespace Portfolio.Api.Common;

/// <summary>One page of a list. <paramref name="Page"/> is 1-based; past the end, <paramref name="Items"/> is empty.</summary>
public record PagedResponse<T>(IReadOnlyList<T> Items, int Page, int PageSize, int TotalCount);
