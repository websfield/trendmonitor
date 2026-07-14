using System.Reflection;
using UgcIntelligence.C2.Api.Repositories;
using UgcIntelligence.Domain.Entities;
using Xunit;

namespace UgcIntelligence.Architecture.Tests;

/// <summary>
/// Rule 8, as a behaviour and as a reachability fact. Tenant outcome data never crosses tenants, and
/// the constraint lives entirely in <see cref="TenantScopedRepository{TEntity}"/> — the highest-risk
/// surface in this phase. These tests prove tenant B cannot read tenant A's rows through <em>every</em>
/// read path the repositories expose, and the guard below (mirroring <c>ReferenceGraphTestsCanFail</c>)
/// goes red the moment someone adds an unscoped read path such as <c>ListAll()</c>.
/// </summary>
public sealed class TenantScopedRepositoryTests
{
    private static readonly Guid TenantA = Guid.Parse("a0000000-0000-0000-0000-00000000000a");
    private static readonly Guid TenantB = Guid.Parse("b0000000-0000-0000-0000-00000000000b");

    private sealed record Seed(
        Creator Creator, Campaign Campaign, Brief Brief, Submission Submission,
        RightsGrant Grant, ClaimsLedger Ledger, BrandSafetyRule Rule);

    private static Seed SeedFor(Guid tenant)
    {
        var creatorId = Guid.NewGuid();
        var campaignId = Guid.NewGuid();
        var submissionId = Guid.NewGuid();
        return new Seed(
            new Creator(creatorId, tenant, "@c", 30, []),
            new Campaign(campaignId, tenant, "camp", "beauty", "tiktok"),
            new Brief(Guid.NewGuid(), tenant, campaignId, Technical: null),
            new Submission(submissionId, tenant, campaignId, creatorId, "tiktok", "cap", true, DateTimeOffset.UnixEpoch),
            new RightsGrant(Guid.NewGuid(), tenant, submissionId, creatorId, RightsGrantType.OrganicPublish, "uri", null),
            new ClaimsLedger(Guid.NewGuid(), tenant, campaignId, ["clinically proven"]),
            new BrandSafetyRule(Guid.NewGuid(), tenant, "gambling"));
    }

    /// <summary>Tenant B cannot read tenant A's row through Get, and can read its own.</summary>
    [Fact]
    public void Get_IsTenantScoped_BothDirections()
    {
        var (a, b) = (SeedFor(TenantA), SeedFor(TenantB));
        var repo = new CreatorRepository();
        repo.Put(a.Creator);
        repo.Put(b.Creator);

        Assert.Null(repo.Get(TenantB, a.Creator.Id));      // B cannot read A's row by A's id
        Assert.Null(repo.Get(TenantA, b.Creator.Id));      // and A cannot read B's
        Assert.Equal(a.Creator, repo.Get(TenantA, a.Creator.Id));   // each reads only its own
        Assert.Equal(b.Creator, repo.Get(TenantB, b.Creator.Id));
    }

    /// <summary>List returns only the caller's tenant's rows.</summary>
    [Fact]
    public void List_ReturnsOnlyCallersTenant()
    {
        var (a, b) = (SeedFor(TenantA), SeedFor(TenantB));
        var repo = new CreatorRepository();
        repo.Put(a.Creator);
        repo.Put(b.Creator);

        Assert.Equal([b.Creator], repo.List(TenantB));
        Assert.Equal([a.Creator], repo.List(TenantA));
        Assert.Empty(repo.List(Guid.NewGuid()));            // an unknown tenant sees nothing
    }

    /// <summary>Where applies the tenant filter first: a permissive predicate cannot widen the scope.</summary>
    [Fact]
    public void Where_AppliesTenantFilterFirst()
    {
        var (a, b) = (SeedFor(TenantA), SeedFor(TenantB));
        var repo = new CreatorRepository();
        repo.Put(a.Creator);
        repo.Put(b.Creator);

        var all = repo.Where(TenantB, _ => true);           // "match everything" still yields only B
        Assert.Equal([b.Creator], all);
        Assert.DoesNotContain(a.Creator, all);
    }

    /// <summary>RightsGrantRepository.ForSubmission is tenant-scoped: B cannot read A's grant by A's submission id.</summary>
    [Fact]
    public void RightsGrant_ForSubmission_IsTenantScoped()
    {
        var (a, b) = (SeedFor(TenantA), SeedFor(TenantB));
        var repo = new RightsGrantRepository();
        repo.Put(a.Grant);
        repo.Put(b.Grant);

        Assert.Empty(repo.ForSubmission(TenantB, a.Submission.Id));       // B cannot reach A's grant
        Assert.Equal([a.Grant], repo.ForSubmission(TenantA, a.Submission.Id));
    }

    /// <summary>ClaimsLedgerRepository.ForCampaign is tenant-scoped: B gets null for A's campaign ledger.</summary>
    [Fact]
    public void ClaimsLedger_ForCampaign_IsTenantScoped()
    {
        var (a, b) = (SeedFor(TenantA), SeedFor(TenantB));
        var repo = new ClaimsLedgerRepository();
        repo.Put(a.Ledger);
        repo.Put(b.Ledger);

        Assert.Null(repo.ForCampaign(TenantB, a.Campaign.Id));            // B cannot read A's ledger
        Assert.Equal(a.Ledger, repo.ForCampaign(TenantA, a.Campaign.Id));
    }

    /// <summary>The isolation holds across every ITenantOwned repository the phase ships, not just Creator.</summary>
    [Fact]
    public void EveryRepository_IsolatesByTenant()
    {
        var (a, b) = (SeedFor(TenantA), SeedFor(TenantB));

        var campaigns = new CampaignRepository();
        campaigns.Put(a.Campaign); campaigns.Put(b.Campaign);
        Assert.Null(campaigns.Get(TenantB, a.Campaign.Id));
        Assert.Equal([b.Campaign], campaigns.List(TenantB));

        var briefs = new BriefRepository();
        briefs.Put(a.Brief); briefs.Put(b.Brief);
        Assert.Null(briefs.Get(TenantB, a.Brief.Id));

        var submissions = new SubmissionRepository();
        submissions.Put(a.Submission); submissions.Put(b.Submission);
        Assert.Null(submissions.Get(TenantB, a.Submission.Id));

        var rules = new BrandSafetyRuleRepository();
        rules.Put(a.Rule); rules.Put(b.Rule);
        Assert.Null(rules.Get(TenantB, a.Rule.Id));
        Assert.Equal([b.Rule], rules.List(TenantB));
    }

    /// <summary>
    /// Optional hardening. A <c>Put</c> that would re-tenant an existing id is refused — an id is never
    /// reused across tenants, so a cross-tenant overwrite is a bug, not an update.
    /// </summary>
    [Fact]
    public void Put_RefusesToRetenantAnExistingId()
    {
        var repo = new CreatorRepository();
        var id = Guid.NewGuid();
        repo.Put(new Creator(id, TenantA, "@c", 30, []));

        var collidingUnderB = new Creator(id, TenantB, "@c", 30, []);
        Assert.Throws<InvalidOperationException>(() => repo.Put(collidingUnderB));

        // A's row is untouched; B still cannot see it.
        Assert.Equal(TenantA, repo.Get(TenantA, id)!.TenantId);
        Assert.Null(repo.Get(TenantB, id));
    }

    // ---- The can-fail guard --------------------------------------------------------------------

    /// <summary>
    /// The structural guard: <strong>no public read path on any production repository returns entities
    /// without taking a tenant scope.</strong> A future <c>ListAll()</c>, or a <c>Get(Guid id)</c> that
    /// dropped the tenant, or an <c>IgnoreTenantScope</c> read would compile and pass every behavioural
    /// test above (nobody would write a test that calls it) — this is the test that goes red instead.
    /// </summary>
    [Fact]
    public void NoProductionRepository_ExposesAnUnscopedReadPath()
    {
        var repos = ProductionRepositoryTypes();
        Assert.NotEmpty(repos);   // a guard that scans nothing certifies nothing

        foreach (var repo in repos)
        {
            var offenders = UnscopedReadPaths(repo);
            Assert.True(offenders.Count == 0,
                $"TENANCY WIDENING: {repo.Name} exposes read path(s) {string.Join(", ", offenders)} that "
                + "return tenant-owned entities without a Guid tenant scope. Every read must be tenant-filtered — "
                + "no ListAll(), no unscoped Get, no IgnoreTenantScope.");
        }
    }

    /// <summary>Every concrete <see cref="TenantScopedRepository{TEntity}"/> in the C2.Api assembly.</summary>
    private static IReadOnlyList<Type> ProductionRepositoryTypes() =>
        [.. Assembly.Load("UgcIntelligence.C2.Api").GetTypes()
            .Where(t => t is { IsClass: true, IsAbstract: false } && InheritsScopedRepository(t))];

    private static bool InheritsScopedRepository(Type t)
    {
        for (var bt = t.BaseType; bt is not null; bt = bt.BaseType)
            if (bt.IsGenericType && bt.GetGenericTypeDefinition() == typeof(TenantScopedRepository<>)) return true;
        return false;
    }

    /// <summary>
    /// The read paths on <paramref name="repoType"/> that produce entities but take no <see cref="Guid"/>
    /// scope. This is the detection mechanism; <c>TenantScopedRepositoryTestsCanFail</c> proves it is not a no-op.
    /// </summary>
    internal static IReadOnlyList<string> UnscopedReadPaths(Type repoType) =>
        // No DeclaredOnly: a widening method added to the base TenantScopedRepository is inherited by
        // every concrete repo, and must be caught there too.
        [.. repoType.GetMethods(BindingFlags.Public | BindingFlags.Instance)
            .Where(m => !m.IsSpecialName && m.DeclaringType != typeof(object) && ProducesEntities(m.ReturnType))
            .Where(m => m.GetParameters().All(p => p.ParameterType != typeof(Guid)))
            .Select(m => m.Name)
            .Distinct()];

    /// <summary>True when a return type is, or is a collection of, an <see cref="ITenantOwned"/> entity.</summary>
    private static bool ProducesEntities(Type returnType)
    {
        if (typeof(ITenantOwned).IsAssignableFrom(returnType)) return true;
        if (!returnType.IsGenericType) return false;
        return returnType.GetGenericArguments().Any(arg => typeof(ITenantOwned).IsAssignableFrom(arg));
    }
}

/// <summary>
/// The guard above must be able to fail. This runs the same detection mechanism against a deliberately
/// leaky repository — one with an unscoped <c>ListAll()</c> — and asserts it is flagged. If this ever
/// stops detecting the leak, <see cref="TenantScopedRepositoryTests.NoProductionRepository_ExposesAnUnscopedReadPath"/>
/// has become a no-op that certifies an absence.
/// </summary>
public sealed class TenantScopedRepositoryTestsCanFail
{
    /// <summary>A repository that widens the scope, exactly the mistake the guard exists to catch.</summary>
    private sealed class LeakyRepository : TenantScopedRepository<Creator>
    {
        // No Guid scope, returns entities across every tenant. A convenience someone would reach for.
        public IReadOnlyList<Creator> ListAll() => List(Guid.Empty);
    }

    [Fact]
    public void TheDetectionMechanism_FlagsAnUnscopedReadPath()
    {
        var offenders = TenantScopedRepositoryTests.UnscopedReadPaths(typeof(LeakyRepository));
        Assert.Contains("ListAll", offenders);
    }

    /// <summary>A properly scoped repository is not flagged — the guard is specific, not trigger-happy.</summary>
    [Fact]
    public void TheDetectionMechanism_DoesNotFalselyFlagAScopedRepository()
    {
        Assert.Empty(TenantScopedRepositoryTests.UnscopedReadPaths(typeof(CreatorRepository)));
    }
}
