using System.Collections.Concurrent;
using UgcIntelligence.Domain.Entities;

namespace UgcIntelligence.C2.Api.Repositories;

/// <summary>
/// Rule 8, made structural. Every read filters on <c>tenant_id</c>, and there is <strong>no method
/// that returns entities across tenants</strong> — no <c>ListAll()</c>, no <c>IgnoreTenantScope</c>
/// flag, no admin path. Outcome data derived from one tenant's campaigns cannot inform another
/// tenant's scoring, and the constraint is a property of the surface, not a policy someone can be
/// persuaded to relax under commercial pressure.
///
/// <para>In-memory, matching the Phase 0 store convention (<c>AppendOnlyEventLog</c>,
/// <c>ArtefactStore</c>). Persistence technology is an implementation detail; the tenant-scoping
/// invariant is not.</para>
/// </summary>
public abstract class TenantScopedRepository<TEntity> where TEntity : class, ITenantOwned
{
    private readonly ConcurrentDictionary<Guid, TEntity> _byId = new();

    /// <summary>
    /// Insert or replace. Callers upstream own tenant assignment; this never re-tenants a record. An
    /// overwrite that would move a record from one tenant to another is refused: an id is never reused
    /// across tenants, and a <c>Put</c> that silently re-tenanted a row would be a widening path wearing
    /// a write's clothing.
    /// </summary>
    public void Put(TEntity entity) =>
        _byId.AddOrUpdate(entity.Id, entity, (_, existing) =>
            existing.TenantId == entity.TenantId
                ? entity
                : throw new InvalidOperationException(
                    $"Refusing to overwrite {typeof(TEntity).Name} {entity.Id} owned by tenant {existing.TenantId} "
                    + $"with a record claiming tenant {entity.TenantId}. An id is never reused across tenants."));

    /// <summary>Returns the entity only if it exists <em>and</em> belongs to <paramref name="tenantId"/>.</summary>
    public TEntity? Get(Guid tenantId, Guid id) =>
        _byId.TryGetValue(id, out var e) && e.TenantId == tenantId ? e : null;

    /// <summary>Every entity for one tenant. There is deliberately no unscoped overload.</summary>
    public IReadOnlyList<TEntity> List(Guid tenantId) =>
        [.. _byId.Values.Where(e => e.TenantId == tenantId)];

    /// <summary>Tenant-scoped predicate query. The tenant filter is applied first and cannot be bypassed.</summary>
    public IReadOnlyList<TEntity> Where(Guid tenantId, Func<TEntity, bool> predicate) =>
        [.. _byId.Values.Where(e => e.TenantId == tenantId && predicate(e))];
}

/// <summary>Creator records. Feeds V6 (verified age) and V3 (active brand-safety flags).</summary>
public sealed class CreatorRepository : TenantScopedRepository<Creator>;

/// <summary>Campaigns.</summary>
public sealed class CampaignRepository : TenantScopedRepository<Campaign>;

/// <summary>Briefs. Feeds V5 (stored format requirements).</summary>
public sealed class BriefRepository : TenantScopedRepository<Brief>;

/// <summary>Submissions.</summary>
public sealed class SubmissionRepository : TenantScopedRepository<Submission>;

/// <summary>Rights grants. Feeds V4. A grant without evidence is not a grant.</summary>
public sealed class RightsGrantRepository : TenantScopedRepository<RightsGrant>
{
    /// <summary>The grants recorded against one submission, tenant-scoped.</summary>
    public IReadOnlyList<RightsGrant> ForSubmission(Guid tenantId, Guid submissionId) =>
        Where(tenantId, g => g.SubmissionId == submissionId);
}

/// <summary>Approved claims ledgers. Feeds V2. Absent ledger ⇒ V2 unevaluable.</summary>
public sealed class ClaimsLedgerRepository : TenantScopedRepository<ClaimsLedger>
{
    /// <summary>The ledger for one campaign, or null if none is configured (V2 becomes unevaluable).</summary>
    public ClaimsLedger? ForCampaign(Guid tenantId, Guid campaignId) =>
        Where(tenantId, l => l.CampaignId == campaignId).FirstOrDefault();
}

/// <summary>Configured brand-safety rules. Feeds V3.</summary>
public sealed class BrandSafetyRuleRepository : TenantScopedRepository<BrandSafetyRule>;
