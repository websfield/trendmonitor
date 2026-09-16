'use strict';

// Read-only evidence operations. Importing this module performs no filesystem I/O.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SCHEMA_VERSION = 1;
const LIMITS = Object.freeze({ jsonBytes: 2 * 1024 * 1024, files: 10000, totalBytes: 64 * 1024 * 1024, depth: 64, graphEdges: 100000 });
const KINDS = ['check', 'review', 'acceptance', 'integration', 'production', 'docs', 'dod'];
const RESULTS = ['PASS', 'FAIL', 'UNVERIFIED', 'INTERRUPTED'];
const SEVERITIES = ['Critical', 'High', 'Medium', 'Low', 'Info'];
const INSTALL_ACTIONS = ['copied', 'skipped-existing', 'settings-sidecar', 'customized-merged', 'missing'];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const isReview = obligation => ['review', 'production'].includes(obligation.kind);

class WorkflowError extends Error {
  constructor(code, message, nextAction = 'Inspect the selected goal and correct the request; preserve its existing records.') {
    super(message); this.name = 'WorkflowError'; this.code = code; this.nextAction = nextAction;
  }
}
function fail(code, message, action) { throw new WorkflowError(code, message, action); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID', `${label} must be an object.`); return value; }
function string(value, label) { if (typeof value !== 'string' || !value.trim() || value.length > 100000) fail('INVALID', `${label} must be a nonempty bounded string.`); return value; }
function list(value, label, nonempty = false) { if (!Array.isArray(value) || value.length > LIMITS.files || (nonempty && !value.length)) fail('INVALID', `${label} must be ${nonempty ? 'a nonempty' : 'an'} array.`); return value; }
function unique(values, label) { if (new Set(values).size !== values.length) fail('DUPLICATE', `${label} contains duplicate identities.`); }
function strings(value, label, nonempty = true) { list(value, label, nonempty).forEach(x => string(x, label)); unique(value, label); return value; }
function integer(value, label, min = 0) { if (!Number.isSafeInteger(value) || value < min) fail('INVALID', `${label} must be an integer at least ${min}.`); return value; }
function oneOf(value, allowed, label) { if (!allowed.includes(value)) fail('INVALID', `${label} must be one of ${allowed.join(', ')}.`); return value; }
function id(value, label) { if (typeof value !== 'string' || !UUID.test(value)) fail('INVALID', `${label} must be a stable UUID.`); return value; }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function canonical(value) {
  return JSON.stringify((function order(x) { return Array.isArray(x) ? x.map(order) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, order(x[k])])) : x; })(value));
}
function digest(value) { return hash(canonical(value)); }
function hashString(value, label) { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail('INVALID', `${label} must be a SHA-256 digest.`); return value; }
// `discovered` marks a path this engine enumerated on the local filesystem rather than one a caller
// supplied. Names that are merely awkward on Windows — device aliases (aux, nul, com1), a trailing
// dot or space, a colon — are ordinary and legal on Linux/macOS. Applying those rules to discovered
// inputs makes every mutation and every readiness derivation fail for a repository that simply
// contains `src/aux.h`, with no path named in the message. Traversal, absolute, NUL, control
// characters and safePath's symlink walk still cover the actual escape risk.
function relative(value, allowRoot = false, discovered = false) {
  string(value, 'path');
  if (allowRoot && value === '.') return value;
  if (path.isAbsolute(value) || value.includes('\\') || value.includes('\0') || value.startsWith('/') || (!discovered && value.includes(':'))) fail('PATH', 'Use a project-relative path with forward slashes: ' + value);
  const pieces = value.split('/');
  const unsafe = p => !p || p === '.' || p === '..' || /[\x00-\x1f]/.test(p)
    || (!discovered && (/[ .]$/.test(p) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)));
  if (pieces.some(unsafe)) fail('PATH', 'The path contains traversal or an ambiguous filesystem alias: ' + value);
  return value;
}
function within(root, child) { const r = path.relative(root, child); return r !== '..' && !r.startsWith('..' + path.sep) && !path.isAbsolute(r); }
function project(root) {
  string(root, 'projectRoot');
  if (!path.isAbsolute(root)) fail('PATH', 'projectRoot must be absolute.');
  const resolved = path.resolve(root);
  if (!fs.statSync(resolved).isDirectory() || fs.lstatSync(resolved).isSymbolicLink()) fail('PATH', 'projectRoot must be a real directory.');
  return fs.realpathSync(resolved);
}
function safePath(root, rel, allowRoot = false, discovered = false) {
  relative(rel, allowRoot, discovered); const target = path.resolve(root, rel);
  if (!within(root, target)) fail('PATH', 'Path escapes the selected project.');
  let at = root;
  for (const piece of path.relative(root, target).split(path.sep).filter(Boolean)) {
    at = path.join(at, piece);
    let stat; try { stat = fs.lstatSync(at); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (stat && (stat.isSymbolicLink() || !within(root, fs.realpathSync(at)))) fail('PATH', 'Symlink/junction paths are not evidence-safe.');
  }
  return target;
}
function location(options) {
  object(options, 'request'); const root = project(options.projectRoot); const goalDirectory = relative(options.goalDirectory);
  if (!/^docs\/progress\/[^/]+$/.test(goalDirectory)) fail('PATH', 'goalDirectory must be docs/progress/<one goal name>.');
  const goal = safePath(root, goalDirectory);
  return { root, goalDirectory, goal, snapshot: safePath(root, goalDirectory + '/workflow.json'), lock: safePath(root, goalDirectory + '/workflow.lock') };
}
function readBounded(file) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > LIMITS.jsonBytes) fail('RESOURCE', 'Evidence must be a regular file no larger than 2 MiB.');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = fs.fstatSync(fd);
    if (!opened.isFile() || opened.size > LIMITS.jsonBytes) fail('RESOURCE', 'Evidence file changed or exceeds its bound.');
    const data = fs.readFileSync(fd); if (data.length > LIMITS.jsonBytes) fail('RESOURCE', 'Evidence exceeds its read bound.'); return data;
  } finally { fs.closeSync(fd); }
}
function readJSON(file) { try { return JSON.parse(readBounded(file).toString('utf8')); } catch (error) { if (error instanceof WorkflowError) throw error; fail('INVALID', 'Cannot read valid bounded JSON: ' + path.basename(file)); } }
function validateSource(source) {
  object(source, 'contract source'); relative(source.path);
  list(source.projectionBlocks || [], 'projectionBlocks').forEach(block => { object(block, 'projection block'); string(block.start, 'projection start'); string(block.end, 'projection end'); if (block.start === block.end) fail('INVALID', 'Projection delimiters must differ.'); });
}
function subjectBytes(bytes, source) {
  if (!source || !source.projectionBlocks?.length) return bytes;
  let text = bytes.toString('utf8'); const ranges = [];
  for (const block of source.projectionBlocks) {
    const start = text.indexOf(block.start), end = text.indexOf(block.end, start + block.start.length);
    if (start < 0 || end < 0 || text.indexOf(block.start, start + block.start.length) >= 0 || text.indexOf(block.end, end + block.end.length) >= 0) fail('CONTRACT', 'Generated projection delimiters are missing or ambiguous.');
    ranges.push([start + block.start.length, end]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < ranges.length; i++) if (ranges[i][0] < ranges[i - 1][1]) fail('CONTRACT', 'Generated projection blocks overlap.');
  for (const [start, end] of ranges.reverse()) text = text.slice(0, start) + '\n<engine-owned projection>\n' + text.slice(end);
  return Buffer.from(text);
}
function captureContract(options, contract) {
  const loc = location(options); object(contract, 'contract'); string(contract.content, 'contract.content');
  const sources = list(contract.sources || [], 'contract.sources').map(source => { validateSource(source); const bytes = readBounded(safePath(loc.root, source.path)); return { path: source.path, projectionBlocks: source.projectionBlocks || [], hash: hash(subjectBytes(bytes, source)) }; });
  unique(sources.map(x => x.path), 'contract sources');
  return { content: contract.content, sources };
}
function validateObligation(ob, scope) {
  object(ob, 'obligation'); id(ob.obligationId, 'obligationId'); string(ob.key, 'obligation key'); oneOf(ob.kind, KINDS, 'obligation kind');
  strings(ob.coverage, 'coverage').forEach(x => { if (!scope.includes(x)) fail('INVALID', 'Coverage names an unknown acceptance item.'); });
  if (ob.kind === 'check') string(ob.command, 'check command');
  if (ob.roots) { strings(ob.roots, 'obligation roots'); ob.roots.forEach(x => relative(x, true)); string(ob.dependencyJustification, 'dependencyJustification'); }
  if (ob.final !== undefined && typeof ob.final !== 'boolean') fail('INVALID', 'final must be boolean.');
  if (ob.separate !== undefined && typeof ob.separate !== 'boolean') fail('INVALID', 'separate must be boolean.');
}
function validateSlotGraph(slots) {
  list(slots, 'slots', true); unique(slots.map(s => s.key), 'slot keys');
  const nodes = new Map(slots.map(slot => { string(slot.key, 'slot key'); return [slot.key, { degree: 0, next: [] }]; }));
  let edges = 0;
  for (const slot of slots) {
    strings(slot.after, 'slot dependencies', false);
    edges += slot.after.length; if (edges > LIMITS.graphEdges) fail('RESOURCE', 'Reviewer dependency graph exceeds 100,000 edges.');
    for (const parent of slot.after) {
      if (!nodes.has(parent) || parent === slot.key) fail('BINDING', 'Slot dependencies must name other slots in this batch.');
      nodes.get(slot.key).degree++; nodes.get(parent).next.push(slot.key);
    }
  }
  const ready = [...nodes].filter(([, node]) => node.degree === 0).map(([key]) => key);
  for (let at = 0; at < ready.length; at++) for (const key of nodes.get(ready[at]).next) if (--nodes.get(key).degree === 0) ready.push(key);
  if (ready.length !== nodes.size) fail('BINDING', 'Slot dependencies contain a cycle.');
}
function reviewBatches(gate) {
  const allowed = [0, 1, 2];
  for (const extension of list(gate.budget.extensions || [], 'budget extensions')) {
    id(extension.extensionId, 'extensionId'); object(extension.approval, 'extension approval');
    string(extension.approval.reference, 'approval reference');
    if (extension.approval.gateId !== gate.gateId) fail('BUDGET', 'Approval is for another continuing gate.');
    strings(extension.approval.obligationIds, 'approved review obligations').forEach(obId => {
      if (!gate.obligations.some(o => o.obligationId === obId && isReview(o))) fail('BUDGET', 'Approval must name retained review obligations in this gate.');
    });
    list(extension.batches, 'approved batches', true).forEach(n => {
      integer(n, 'approved batch', 3);
      if (n !== allowed.at(-1) + 1) fail('BUDGET', 'Approved extensions must append consecutive batches without duplicates.');
      allowed.push(n);
    });
  }
  unique((gate.budget.extensions || []).map(x => x.approval.reference), 'extension approval references');
  unique((gate.budget.extensions || []).map(x => x.extensionId), 'extension IDs');
  return allowed;
}
function findingVersions(state, gateId) { return state.findings.filter(f => f.gateId === gateId).map(f => ({ findingId: f.findingId, version: f.version })); }
function validateRisk(risk) {
  object(risk, 'finding risk'); for (const key of ['security', 'dataLoss']) oneOf(risk[key], ['yes', 'no', 'unknown'], 'risk.' + key);
  if (risk.reference !== null) string(risk.reference, 'risk.reference');
}
function validateDeferralShape(state, finding) {
  const deferral = object(finding.deferral, 'deferral');
  if (state.lane !== 'planned') fail('DEFERRAL', 'Future-phase deferral is available only to a planned independent review.');
  id(deferral.receivingPhaseId, 'receivingPhaseId'); string(deferral.reference, 'deferral.reference');
  const source = findGate(state, finding.gateId).phase, receiving = state.phases.find(p => p.phaseId === deferral.receivingPhaseId);
  if (!receiving || state.phases.indexOf(receiving) <= state.phases.indexOf(source)) fail('DEFERRAL', 'A deferral must name a later existing phase in the accepted phase order.');
  object(deferral.reachability, 'reachability'); oneOf(deferral.reachability.status, ['unreachable'], 'reachability status');
  string(deferral.reachability.reference, 'reachability.reference'); id(deferral.reachability.proofReceiptId, 'reachability.proofReceiptId');
  validateRisk(deferral.risk); string(deferral.risk.reference, 'deferral risk reference');
  if (['security', 'dataLoss'].some(key => deferral.risk[key] === 'unknown') || deferral.risk.dataLoss === 'yes' || (deferral.risk.security === 'yes' && ['High', 'Critical'].includes(finding.severity))) fail('DEFERRAL', 'Unknown risk, possible data loss and security High/Critical findings cannot be deferred.');
  for (const key of ['security', 'dataLoss']) if (finding.disposition === 'deferred' && finding.risk?.[key] === 'yes' && deferral.risk[key] !== 'yes') fail('DEFERRAL', 'A deferral cannot downgrade retained positive risk facts.');
  integer(deferral.recordedRevision, 'deferral recordedRevision', 1); integer(deferral.findingVersion, 'deferral findingVersion', 1);
  if (deferral.recordedRevision > state.stateRevision || deferral.findingVersion > finding.version) fail('BINDING', 'Deferral chronology is outside retained history.');
  if (deferral.activatedRevision != null) {
    integer(deferral.activatedRevision, 'activatedRevision', deferral.recordedRevision + 1);
    if (deferral.activatedRevision > state.stateRevision || receiving.enteredRevision == null || receiving.enteredRevision > deferral.activatedRevision || finding.disposition === 'deferred' || !finding.history.some(h => h.activated === true && h.receivingPhaseId === receiving.phaseId && h.deferral?.activatedRevision === deferral.activatedRevision)) fail('BINDING', 'Activation does not match the retained phase/finding history.');
  }
  return receiving;
}
function validateDeferralEvidence(options, finding) {
  validateDeferralShape(options.state, finding);
  const reference = options.state.receipts.find(r => r.receiptId === finding.deferral.reachability.proofReceiptId);
  if (!reference) fail('DEFERRAL', 'Deferral requires a retained independent reachability report receipt.');
  const receipt = currentReceipt(options, reference), { gate } = findGate(options.state, finding.gateId);
  if (receipt.gateId !== finding.gateId || !['PASS', 'FAIL'].includes(receipt.result) || receipt.observed.provenance !== 'observed' || !receipt.obligationIds.some(id => gate.obligations.some(o => o.obligationId === id && isReview(o)))) fail('DEFERRAL', 'Reachability proof must be a current observed independent assessment of this original gate.');
  if (!receipt.findingVersions.some(v => v.findingId === finding.findingId && v.version === finding.deferral.findingVersion)) fail('DEFERRAL', 'Reachability proof must assess the deferred finding version, not an earlier generic review.');
  // The declared security obligation survives dispatch through a generic fallback context/role.
  const security = gate.obligations.some(o => /security/i.test(o.role || '')) || gate.batches.flatMap(b => b.slots).some(s => /security/i.test(s.role || ''));
  if (security && finding.deferral.risk.security !== 'yes') fail('DEFERRAL', 'An original security-reviewer gate retains security risk through generic runtime fallback.');
  return receipt;
}
function validateFindingVersions(versions, state, gateId) {
  list(versions, 'findingVersions').forEach(binding => { id(binding.findingId, 'findingId'); integer(binding.version, 'finding version', 1); const f = state.findings.find(f => f.findingId === binding.findingId && f.gateId === gateId); if (!f || binding.version > f.version) fail('BINDING', 'Assessment names an unknown finding version.'); });
  unique(versions.map(v => v.findingId), 'assessed finding IDs');
}
function validateWorkflow(state) {
  object(state, 'workflow'); if (state.schemaVersion !== SCHEMA_VERSION) fail('UNSUPPORTED', 'Unsupported workflow schema; use the manual checklist.');
  integer(state.stateRevision, 'stateRevision', 1); id(state.goalId, 'goalId'); string(state.title, 'title'); oneOf(state.lane, ['fast', 'planned'], 'lane');
  strings(state.originalAcceptanceScope, 'originalAcceptanceScope'); strings(state.acceptanceScope, 'acceptanceScope');
  if (state.originalAcceptanceScope.some(x => !state.acceptanceScope.includes(x))) fail('SCOPE', 'Original acceptance scope was erased.');
  object(state.authorization, 'authorization'); string(state.authorization.reference, 'authorization.reference'); strings(state.authorization.scope, 'authorization.scope');
  object(state.execution, 'execution'); string(state.execution.sessionId, 'execution.sessionId'); oneOf(state.execution.disposition, ['running', 'waiting', 'paused', 'blocked', 'complete'], 'disposition');
  // Phase 2b: this branch is a deliberately PARTIAL schema. It exists only so the Stop hook's
  // decision logic and its isolated test probe (tests/workflow/stop-probe.js) can construct a
  // schema-valid synthetic activation record — there is no `amend` verb or any other CLI-reachable
  // path in workflow-state.js that can ever set `enabled:true` on a real goal. Session identity
  // alone is NOT the full binding the Stop decision requires: a real future activation also needs
  // recomputed project-hook/config hashes, which are intentionally left undesigned until real probe
  // evidence exists to inform that shape. Do not treat this branch as "activation is supported."
  object(state.stopGuard, 'stopGuard');
  if (state.stopGuard.enabled === false) {
    if (canonical(state.stopGuard) !== '{"enabled":false}') fail('DISABLED', 'A disabled stopGuard must carry no other fields.');
  } else if (state.stopGuard.enabled === true) {
    object(state.stopGuard.sessionIdentity, 'stopGuard.sessionIdentity');
    string(state.stopGuard.sessionIdentity.value, 'stopGuard.sessionIdentity.value');
    string(state.stopGuard.sessionIdentity.obtainedHow, 'stopGuard.sessionIdentity.obtainedHow');
  } else fail('INVALID', 'stopGuard.enabled must be a boolean.');
  object(state.scope, 'scope'); strings(state.scope.roots, 'scope.roots'); state.scope.roots.forEach(x => relative(x, true)); oneOf(state.scope.dependencyKnowledge, ['complete', 'unknown'], 'dependencyKnowledge');
  list(state.owners, 'owners', true).forEach(owner => { string(owner.ownerId, 'ownerId'); string(owner.contextId, 'construction contextId'); });
  unique(state.owners.map(x => x.ownerId), 'owners'); if (!state.owners.some(x => x.ownerId === state.currentOwnerId)) fail('INVALID', 'Current owner is missing from lineage.');
  const ids = [state.goalId], allObligations = [];
  list(state.phases, 'phases', true).forEach(phase => {
    id(phase.phaseId, 'phaseId'); ids.push(phase.phaseId); string(phase.key, 'phase key'); string(phase.title, 'phase title');
    if (phase.enteredRevision != null) { integer(phase.enteredRevision, 'phase enteredRevision', 1); string(phase.entryReference, 'phase entry reference'); if (phase.enteredRevision > state.stateRevision) fail('BINDING', 'Phase entry is beyond the saved revision.'); }
    const kinds = new Set();
    list(phase.gates, 'gates', true).forEach(gate => {
      id(gate.gateId, 'gateId'); ids.push(gate.gateId); string(gate.key, 'gate key');
      object(gate.budget, 'budget'); oneOf(gate.budget.history, ['known', 'unknown'], 'budget history');
      const allowedBatches = reviewBatches(gate);
      list(gate.budget.consumedBatches, 'consumedBatches').forEach(n => oneOf(n, allowedBatches, 'consumed batch')); unique(gate.budget.consumedBatches, 'consumed batches');
      if (gate.budget.history === 'known') string(gate.budget.reference, 'budget reference');
      list(gate.obligations, 'obligations', true).forEach(ob => { validateObligation(ob, state.acceptanceScope); ids.push(ob.obligationId); allObligations.push(ob); kinds.add(ob.kind); });
      list(gate.batches, 'batches').forEach(batch => {
        id(batch.batchId, 'batchId'); ids.push(batch.batchId); oneOf(batch.number, allowedBatches, 'batch number');
        if (!gate.budget.consumedBatches.includes(batch.number)) fail('BUDGET', 'Reserved batch disappeared from consumed history.');
        hashString(batch.fingerprint.digest, 'batch fingerprint');
        list(batch.slots, 'slots', true).forEach(slot => { id(slot.slotId, 'slotId'); ids.push(slot.slotId); strings(slot.obligationIds, 'slot coverage').forEach(x => { if (!gate.obligations.some(o => o.obligationId === x && isReview(o))) fail('BINDING', 'Review slot names a foreign obligation.'); }); });
        validateSlotGraph(batch.slots);
        if (batch.number > 2) { const extension = gate.budget.extensions.find(x => x.batches.includes(batch.number)); if (batch.extensionId !== extension.extensionId || batch.slots.some(s => s.obligationIds.some(obId => !extension.approval.obligationIds.includes(obId)))) fail('BUDGET', 'Extended batch exceeds its explicit approval scope.'); }
        unique(batch.slots.flatMap(s => s.obligationIds), 'batch obligation coverage');
      }); unique(gate.batches.map(b => b.number), 'batch numbers');
    });
    for (const kind of ['check', 'review', 'acceptance', 'integration', 'docs', 'dod']) if (!kinds.has(kind)) fail('OBLIGATION', `Phase must retain its ${kind} obligation.`);
  });
  for (const kind of ['phase', 'gate', 'obligation']) {
    const collection = kind === 'phase' ? state.phases : kind === 'gate' ? state.phases.flatMap(p => p.gates) : allObligations;
    unique(collection.map(x => x.key), kind + ' keys');
  }
  let previousReservation = 0;
  list(state.attempts, 'attempts').forEach(attempt => {
    id(attempt.attemptId, 'attemptId'); ids.push(attempt.attemptId); const { gate } = findGate(state, attempt.gateId);
    if (attempt.phaseId !== findGate(state, attempt.gateId).phase.phaseId) fail('BINDING', 'Attempt phase does not match its gate.');
    strings(attempt.obligationIds, 'attempt coverage').forEach(x => { if (!gate.obligations.some(o => o.obligationId === x)) fail('BINDING', 'Attempt names a foreign obligation.'); });
    oneOf(attempt.status, ['pending', ...RESULTS], 'attempt status'); hashString(attempt.fingerprint.digest, 'attempt fingerprint');
    integer(attempt.reservedRevision, 'attempt reservedRevision', 1);
    if (attempt.reservedRevision <= previousReservation || attempt.reservedRevision > state.stateRevision) fail('BINDING', 'Attempt reservation lineage is missing, reordered or beyond the saved revision.');
    previousReservation = attempt.reservedRevision;
    validateFindingVersions(attempt.findingVersions, state, gate.gateId);
    if (gate.obligations.some(o => attempt.obligationIds.includes(o.obligationId) && isReview(o)) && !attempt.slotId) fail('INDEPENDENCE', 'Independent review requires its reserved slot.');
    if (attempt.slotId) { const slot = gate.batches.flatMap(b => b.slots).find(s => s.slotId === attempt.slotId); if (!slot || canonical(slot.obligationIds.slice().sort()) !== canonical(attempt.obligationIds.slice().sort())) fail('BINDING', 'Attempt does not match its reserved slot.'); }
  }); unique(state.attempts.filter(a => a.slotId).map(a => a.slotId), 'actual review runs');
  list(state.resources, 'resources').forEach(resource => { relative(resource.path); const validPath = resource.importedReport === true ? /^evidence\/[^/]+$/.test(resource.path) : /^evidence\/[a-f0-9-]+\.(json|txt)$/.test(resource.path); if (!validPath) fail('PATH', 'Only exact registered evidence resources can be excluded.'); hashString(resource.hash, 'resource hash'); }); unique(state.resources.map(r => r.path), 'resources');
  object(state.contract, 'contract reference'); relative(state.contract.path); hashString(state.contract.hash, 'contract hash'); list(state.contractHistory, 'contract history', true);
  let previousReceipt = 0;
  list(state.receipts, 'receipts').forEach(receipt => {
    id(receipt.receiptId, 'receiptId'); ids.push(receipt.receiptId); const attempt = state.attempts.find(a => a.attemptId === receipt.attemptId);
    if (!attempt) fail('BINDING', 'Receipt has no reserved attempt.'); relative(receipt.path); hashString(receipt.hash, 'receipt hash');
    integer(receipt.recordedRevision, 'receipt recordedRevision', 1);
    if (receipt.recordedRevision <= previousReceipt || receipt.recordedRevision <= attempt.reservedRevision || receipt.recordedRevision > state.stateRevision) fail('BINDING', 'Receipt observation lineage is missing, reordered or beyond the saved revision.');
    previousReceipt = receipt.recordedRevision;
  }); unique(state.receipts.map(r => r.attemptId), 'attempt receipts');
  list(state.findings, 'findings').forEach(finding => { id(finding.findingId, 'findingId'); ids.push(finding.findingId); findGate(state, finding.gateId); oneOf(finding.severity, SEVERITIES, 'severity'); oneOf(finding.classification, ['residual', 'sibling', 'fix-induced', 'disputed'], 'classification'); oneOf(finding.disposition, ['open', 'resolved', 'accepted-risk', 'deferred', 'disputed'], 'finding disposition'); string(finding.invariantId, 'invariantId'); string(finding.description, 'finding description'); list(finding.history, 'finding history', true); if (!state.owners.some(o => o.ownerId === finding.ownerId)) fail('BINDING', 'Finding owner is not in lineage.'); if (finding.parentFindingId && !state.findings.some(f => f.findingId === finding.parentFindingId && f.findingId !== finding.findingId && f.invariantId === finding.invariantId)) fail('BINDING', 'Finding parent must retain the same invariant.'); });
  for (const finding of state.findings) {
    integer(finding.version, 'finding version', 1);
    if (1 + finding.history.filter(h => h.reopened === true || h.activated === true).length !== finding.version || finding.history.some(h => !Number.isSafeInteger(h.version) || h.version < 1 || h.version > finding.version || (h.reopened && h.activated))) fail('FINDING', 'Finding proof version does not match its distinct recurrence/activation history.');
    if (finding.risk) { validateRisk(finding.risk); for (const key of ['security', 'dataLoss']) if (finding.history.some(h => h.risk?.[key] === 'yes') && finding.risk[key] !== 'yes') fail('FINDING', 'Retained positive risk facts were downgraded.'); }
    if (finding.deferral) validateDeferralShape(state, finding);
    if (finding.disposition === 'deferred' && !finding.deferral) fail('DEFERRAL', 'A deferred finding needs its named receiving phase and verifiable reachability/risk record.');
    if (finding.disposition === 'resolved') strings(finding.proofReceiptIds, 'resolution proofReceiptIds');
    const seen = new Set([finding.findingId]); let parent = finding.parentFindingId;
    while (parent) { if (seen.has(parent)) fail('BINDING', 'Finding lineage contains a cycle.'); seen.add(parent); parent = state.findings.find(f => f.findingId === parent)?.parentFindingId; }
  }
  list(state.amendments, 'amendments'); string(state.nextAction, 'nextAction'); unique(ids, 'workflow IDs'); return { valid: true };
}
function findGate(state, gateId) { for (const phase of state.phases) { const gate = phase.gates.find(g => g.gateId === gateId); if (gate) return { phase, gate }; } fail('BINDING', 'Unknown gateId.'); }
function loadWorkflow(options) {
  let loc;
  try { loc = location(options); if (!fs.existsSync(loc.snapshot)) return { status: fs.existsSync(loc.goal) && fs.readdirSync(loc.goal).some(x => /\.md$/i.test(x)) ? 'legacy' : 'missing', error: { code: 'MISSING', message: 'No validated workflow snapshot; inspect legacy evidence and follow the manual checklist.', nextAction: 'Inspect existing records before initialization; unknown review history stays unknown.' } }; const state = readJSON(loc.snapshot); validateWorkflow(state); return { status: 'valid', state }; }
  catch (error) {
    const unsupported = error.code === 'UNSUPPORTED', snapshot = loc && loc.goalDirectory + '/workflow.json';
    const nextAction = snapshot ? unsupported ? `Preserve ${snapshot}; use a compatible helper or the manual checklist. Do not edit its schema number or reset history.` : `Preserve ${snapshot} and inspect or restore its valid state from retained evidence; keep review history and use the manual checklist while recovery is unresolved.` : error.nextAction;
    return { status: unsupported ? 'unsupported' : 'invalid', error: { code: error.code || 'INVALID', message: (snapshot ? snapshot + ': ' : '') + error.message, nextAction: nextAction || 'Inspect filesystem access and retain the existing evidence.' } };
  }
}
// Reads and validates .claude/pack-installation.json — separate from goal readiness entirely.
// A desired VERSION is never proof that all files are current; this only reports what the last
// install/sync actually observed. Never throws: an install-time-only artifact must degrade to a
// status object for read-only consumers (doctor.md, sync-pack.md) rather than crash them.
function loadInstallReceipt(projectRoot) {
  let root;
  try { root = project(projectRoot); } catch (error) { return { status: 'invalid', error: { code: error.code || 'INVALID', message: error.message } }; }
  const receiptPath = path.join(root, '.claude', 'pack-installation.json');
  if (!fs.existsSync(receiptPath)) return { status: 'missing' };
  try {
    const receipt = readJSON(receiptPath);
    object(receipt, 'installation receipt');
    if (receipt.schemaVersion !== SCHEMA_VERSION) return { status: 'unsupported', error: { code: 'UNSUPPORTED', message: 'Unsupported installation receipt schema; a newer or older helper wrote it.' } };
    string(receipt.generatorMarker, 'generatorMarker'); string(receipt.sourceRelease, 'sourceRelease'); string(receipt.at, 'at');
    list(receipt.selectedModules, 'selectedModules', false).forEach(m => string(m, 'selectedModules entry'));
    list(receipt.actions, 'actions', false).forEach(a => {
      object(a, 'action'); relative(a.path, false, true); oneOf(a.action, INSTALL_ACTIONS, 'action');
      if (a.sourceHash !== null) hashString(a.sourceHash, 'sourceHash');
      if (a.targetHash !== null) hashString(a.targetHash, 'targetHash');
    });
    return { status: 'valid', receipt };
  } catch (error) {
    return { status: 'invalid', error: { code: error.code || 'INVALID', message: 'pack-installation.json: ' + error.message } };
  }
}
function resourceData(options, state, reference) {
  const loc = location(options); const resource = state.resources.find(r => r.path === reference.path && r.hash === reference.hash);
  if (!resource) fail('RESOURCE', 'An immutable reference is not registered.');
  const bytes = readBounded(safePath(loc.root, loc.goalDirectory + '/' + relative(reference.path)));
  if (hash(bytes) !== reference.hash) fail('RESOURCE', 'Immutable evidence is missing or changed.');
  return bytes;
}
function contractData(options, state) { const c = JSON.parse(resourceData(options, state, state.contract)); if (c.goalId !== state.goalId || !Array.isArray(c.sources)) fail('CONTRACT', 'Accepted contract does not belong to this goal.'); return c; }
function fingerprintInputs(options) {
  const state = options.state; validateWorkflow(state); const loc = location(options); const contract = contractData(options, state);
  const roots = options.roots || state.scope.roots; strings(roots, 'fingerprint roots');
  const excluded = new Set([loc.goalDirectory + '/workflow.json', loc.goalDirectory + '/workflow.lock', ...state.resources.map(r => loc.goalDirectory + '/' + r.path)]);
  const entries = new Map(); let bytesRead = 0;
  const sources = new Map(contract.sources.map(s => [s.path, s]));
  function walk(rel, depth = 0) {
    if (depth > LIMITS.depth || entries.size >= LIMITS.files) fail('RESOURCE', 'Input enumeration exceeds the bounded scope; narrow the explicitly declared scope.');
    // Engine-owned: the snapshot, its lock, exactly registered evidence resources, and an
    // interrupted atomic write's leftover temporary. Without the last one a crash between write
    // and rename leaves an engine artifact inside the assessed subject, which no ORPHAN check
    // reports and only a human deleting it can clear.
    // The goal directory is engine-owned control output: the snapshot, its lock, evidence receipts,
    // and the ledger/report/status projections the shipped commands are *told* to write there.
    // Enumerating those as subject input makes the pack stale its own obligations — and burn the
    // gate allowance — every time it records that a review passed. A contract source declared
    // inside the goal directory stays subject; nothing else there does.
    if (rel.startsWith(loc.goalDirectory + '/') && !sources.has(rel)) return;
    if (excluded.has(rel) || rel === '.git' || rel.startsWith('.git/')) return;
    const file = safePath(loc.root, rel, true, true);
    if (!fs.existsSync(file)) { entries.set(rel, 'MISSING'); return; }
    const stat = fs.lstatSync(file);
    if (stat.isDirectory()) { for (const name of fs.readdirSync(file).sort()) walk(rel === '.' ? name : rel + '/' + name, depth + 1); return; }
    if (!stat.isFile() || stat.size > LIMITS.jsonBytes) fail('RESOURCE', 'Input must be a bounded regular file: ' + rel);
    bytesRead += stat.size; if (bytesRead > LIMITS.totalBytes) fail('RESOURCE', 'Input scope exceeds 64 MiB.');
    const bytes = readBounded(file), value = hash(subjectBytes(bytes, sources.get(rel))); entries.set(rel, value);
  }
  roots.forEach(root => walk(relative(root, true)));
  for (const source of contract.sources) { walk(source.path); if (entries.get(source.path) !== source.hash) fail('CONTRACT_CHANGED', 'Accepted contract source changed: ' + source.path, 'Inspect the semantic change and record a contract amendment before another assessment.'); }
  const inventory = [...entries].sort((a, b) => a[0].localeCompare(b[0]));
  const fingerprint = { entries: inventory, roots: roots.slice().sort(), contractHash: state.contract.hash };
  return { ...fingerprint, digest: digest(fingerprint) };
}
function attemptRoots(state, obligations) {
  if (state.scope.dependencyKnowledge !== 'complete' || obligations.some(o => !o.roots || !o.dependencyJustification)) return state.scope.roots;
  const roots = [...new Set(obligations.flatMap(o => o.roots))];
  for (const root of roots) if (!state.scope.roots.some(base => base === '.' || root === base || root.startsWith(base + '/'))) fail('SCOPE', 'An obligation scope is outside declared project inputs.');
  return roots;
}
function assessmentFingerprint(options, obligationIds) {
  const state = options.state, obligations = state.phases.flatMap(p => p.gates.flatMap(g => g.obligations)).filter(o => obligationIds.includes(o.obligationId));
  if (obligations.length !== obligationIds.length) fail('BINDING', 'Unknown obligation in assessment.');
  const value = fingerprintInputs({ ...options, roots: attemptRoots(state, obligations) });
  const fingerprint = { ...value, obligationsHash: digest(obligations), digest: undefined }; delete fingerprint.digest;
  return { ...fingerprint, digest: digest(fingerprint) };
}
function validateExecutionEvidence(receipt, attempt, state, obligations) {
  const terminalOnly = ['UNVERIFIED', 'INTERRUPTED'].includes(receipt.result);
  const observed = object(receipt.observed, 'observed provenance');
  oneOf(observed.provenance, terminalOnly ? ['observed', 'unknown'] : ['observed'], 'execution provenance');
  for (const key of ['contextId', 'dispatchId', 'sessionId']) if (!(terminalOnly && observed.provenance === 'unknown' && observed[key] === null)) string(observed[key], 'observed ' + key);
  if (observed.sessionId !== null && observed.sessionId !== attempt.sessionId) fail('INDEPENDENCE', 'Observed session does not match the reserved execution session.');
  if (observed.provenance === 'unknown' || receipt.reconciliation != null) {
    if (!terminalOnly) fail('RESULT', 'Reconciliation cannot establish a successful or failing assessment.');
    const reconciliation = object(receipt.reconciliation, 'reconciliation');
    oneOf(reconciliation.disposition, ['launch-refused', 'interrupted', 'unverified'], 'reconciliation disposition');
    string(reconciliation.reason, 'reconciliation reason'); string(reconciliation.reference, 'reconciliation reference');
  }
  if (obligations.some(isReview)) {
    if (!attempt.slotId) fail('INDEPENDENCE', 'Independent assessment has no reserved slot.');
    if (observed.provenance === 'observed' && state.owners.some(o => o.contextId === observed.contextId)) fail('INDEPENDENCE', 'A present or prior construction context cannot supply independent review.');
    if (!(terminalOnly && receipt.rawVerdict == null)) oneOf(receipt.rawVerdict, ['PASS', 'READY', 'NEEDS CHANGES', 'BLOCK', 'NOT READY', 'UNVERIFIED', 'INTERRUPTED'], 'rawVerdict');
    if (receipt.result === 'PASS' && !['PASS', 'READY'].includes(receipt.rawVerdict)) fail('RESULT', 'Risk acceptance or a failed raw verdict cannot create PASS.');
  }
  for (const obligation of obligations.filter(o => o.kind === 'check')) {
    if (!(terminalOnly && receipt.command == null) && receipt.command !== obligation.command) fail('RESULT', 'Check evidence must retain the declared actual command.');
    if (!(terminalOnly && receipt.exitCode == null) && !Number.isSafeInteger(receipt.exitCode)) fail('RESULT', 'A known check exit status must be an integer.');
    if (receipt.result === 'PASS' && receipt.exitCode !== 0) fail('RESULT', 'A nonzero check exit status cannot establish PASS.');
  }
}
function receiptData(options, state, reference) {
  const receipt = JSON.parse(resourceData(options, state, reference)); const attempt = state.attempts.find(a => a.attemptId === reference.attemptId);
  if (!attempt || receipt.receiptId !== reference.receiptId || receipt.attemptId !== attempt.attemptId || receipt.goalId !== state.goalId || receipt.gateId !== attempt.gateId || receipt.phaseId !== attempt.phaseId || receipt.slotId !== attempt.slotId || canonical(receipt.obligationIds) !== canonical(attempt.obligationIds) || receipt.preFingerprint !== attempt.fingerprint.digest) fail('BINDING', 'Receipt identities or reserved coverage do not match.');
  oneOf(receipt.result, RESULTS, 'receipt result'); if (receipt.result !== attempt.status) fail('BINDING', 'Receipt and actual attempt disposition disagree.'); resourceData(options, state, receipt.report);
  const { gate } = findGate(state, receipt.gateId); const obs = gate.obligations.filter(o => receipt.obligationIds.includes(o.obligationId));
  if (receipt.reservedRevision !== attempt.reservedRevision) fail('BINDING', 'Receipt does not match its retained reservation order.');
  integer(receipt.recordedRevision, 'receipt recordedRevision', 1);
  if (receipt.recordedRevision !== reference.recordedRevision || receipt.recordedRevision <= attempt.reservedRevision || receipt.recordedRevision > state.stateRevision) fail('BINDING', 'Receipt does not match its retained observation revision.');
  if (canonical(receipt.findingVersions) !== canonical(attempt.findingVersions)) fail('BINDING', 'Receipt does not match its reserved finding versions.');
  validateExecutionEvidence(receipt, attempt, state, obs);
  return receipt;
}
function currentReceipt(options, reference) {
  const receipt = receiptData(options, options.state, reference);
  const current = assessmentFingerprint(options, receipt.obligationIds);
  if (receipt.preFingerprint !== receipt.postFingerprint || receipt.postFingerprint !== current.digest) {
    const before = new Map(options.state.attempts.find(a => a.attemptId === receipt.attemptId).fingerprint.entries), after = new Map(current.entries);
    const changedInputs = [...new Set([...before.keys(), ...after.keys()])].filter(file => before.get(file) !== after.get(file));
    const error = new WorkflowError('STALE', 'Assessment inputs changed; affected evidence is stale.', 'Inspect the changed subject, contract or obligation inputs and rerun the affected validation within the retained review allowance.');
    error.changedInputs = changedInputs; throw error;
  }
  return receipt;
}
function governingAssessments(options) {
  const state = options.state, latest = new Map(), knownFailures = new Map();
  for (const reference of state.receipts) {
    const attempt = state.attempts.find(a => a.attemptId === reference.attemptId);
    const assessment = { reference, attempt };
    try { assessment.receipt = currentReceipt(options, reference); }
    catch (error) { assessment.error = error; }
    // Reservation order selects normal coverage; a PASS must also be newer than known failure observations.
    for (const obId of attempt.obligationIds) if (!latest.has(obId) || attempt.reservedRevision > latest.get(obId).attempt.reservedRevision) latest.set(obId, assessment);
    // Freshness is attempt-wide, but coverage and masking are per obligation. Reading the disposition
    // from the retained attempt keeps a recorded FAIL a known failure even when a later edit outside
    // the disputed obligation's own inputs made its attempt stale; dropping it here would let an older
    // PASS silently govern an unresolved failure and report Ready. receiptData already proved the
    // attempt disposition and reference revision agree with the receipt when it was recorded.
    if (attempt.status === 'FAIL') for (const obId of attempt.obligationIds) if (!knownFailures.has(obId) || reference.recordedRevision > knownFailures.get(obId).reference.recordedRevision) knownFailures.set(obId, assessment);
  }
  // A stale failure carries its STALE error into `latest`, so the obligation is reported as STALE
  // (never covered) rather than vanishing: unknown applicability keeps the goal Not yet.
  for (const [obId, failure] of knownFailures) if (latest.get(obId)?.receipt?.result === 'PASS' && latest.get(obId).attempt.reservedRevision <= failure.reference.recordedRevision) latest.set(obId, failure);
  return latest;
}
function validateFindingProof(options, finding, assessments = governingAssessments(options)) {
  const state = options.state; strings(finding.proofReceiptIds, 'proofReceiptIds');
  const { gate } = findGate(state, finding.gateId);
  const receipts = finding.proofReceiptIds.map(receiptId => {
    const reference = state.receipts.find(r => r.receiptId === receiptId); if (!reference) fail('FINDING', 'Resolution names an unknown receipt.');
    const receipt = currentReceipt(options, reference);
    if (receipt.result !== 'PASS' || receipt.gateId !== finding.gateId) fail('FINDING', 'Resolution needs current successful evidence for this gate.');
    return receipt;
  });
  const governs = (receipt, obligation) => assessments.get(obligation.obligationId)?.receipt?.receiptId === receipt.receiptId && receipt.result === 'PASS';
  const obligations = receipts.flatMap(r => gate.obligations.filter(o => r.obligationIds.includes(o.obligationId) && governs(r, o)));
  if (!obligations.some(o => o.kind === 'check') || !obligations.some(isReview)) fail('FINDING', 'Resolution requires current check and independent review proof.');
  const repeated = finding.history.some(h => h.reopened === true) || Boolean(finding.parentFindingId);
  if (finding.applicability) {
    const applicability = object(finding.applicability, 'applicability');
    oneOf(applicability.kind, ['cosmetic', 'false-positive'], 'applicability kind');
    string(applicability.reason, 'applicability reason'); string(applicability.reference, 'applicability reference');
    if (applicability.findingVersion !== finding.version || repeated || finding.history.some(h => h.activated === true) || ['Critical', 'High'].includes(finding.severity)) fail('FINDING', 'Explicit applicability is limited to a first nonrelated, nonactivated Medium-or-lower finding version.');
  } else if (receipts.some(r => !r.findingVersions.some(v => v.findingId === finding.findingId && v.version === finding.version))) {
    fail('FINDING', 'Resolution proof was not assessed against this finding version.', 'Reserve affected checks and independent review within the retained allowance, or document eligible unchanged-input cosmetic/false-positive applicability.');
  }
  if (['Critical', 'High'].includes(finding.severity) || repeated) {
    const repair = object(finding.repair, 'repair evidence'); for (const key of ['invariant', 'cause', 'population', 'query', 'reproducer', 'correction', 'before', 'after']) string(repair[key], 'repair.' + key); strings(repair.siblings, 'repair.siblings');
    const before = state.receipts.find(r => r.receiptId === repair.before), after = state.receipts.find(r => r.receiptId === repair.after);
    const beforeReceipt = before && receiptData(options, state, before), afterReceipt = after && currentReceipt(options, after);
    const hasCheck = r => r && r.gateId === finding.gateId && r.obligationIds.some(id => gate.obligations.some(o => o.obligationId === id && o.kind === 'check'));
    const governsCheck = afterReceipt && gate.obligations.some(o => o.kind === 'check' && afterReceipt.obligationIds.includes(o.obligationId) && governs(afterReceipt, o));
    if (!hasCheck(beforeReceipt) || beforeReceipt.result !== 'FAIL' || !governsCheck) fail('FINDING', 'Repair evidence needs failing-before and current governing passing-after checks for this gate.');
    if (!finding.proofReceiptIds.includes(repair.after) || afterReceipt.reservedRevision <= beforeReceipt.recordedRevision) fail('FINDING', 'Passing-after proof must be reserved after the failure was recorded and be part of this resolution.');
  }
  return receipts;
}
function deriveReadiness(options, ownedLockToken) {
  const state = options.state; const outstanding = []; const covered = new Set(); const validReceiptIds = [];
  try {
    validateWorkflow(state); const loc = location(options);
    if (fs.existsSync(loc.lock) && (!ownedLockToken || readBounded(loc.lock).toString('utf8') !== ownedLockToken)) outstanding.push({ code: 'LOCKED', path: loc.goalDirectory + '/workflow.lock', message: 'Current state has an active or uncertain writer lock.', nextAction: 'Inspect the lock owner and retained evidence before relying on this snapshot; recover only after proving the writer is gone, never from lock age alone.' });
    for (const resource of state.resources) resourceData(options, state, resource);
    for (let i = 0; i < state.contractHistory.length; i++) {
      const contract = JSON.parse(resourceData(options, state, state.contractHistory[i]));
      if (contract.goalId !== state.goalId || contract.revision !== i + 1 || canonical(contract.previousContract) !== canonical(i ? state.contractHistory[i - 1] : null)) fail('CONTRACT', 'Accepted contract lineage is incomplete or changed.');
      if (i === 0 && canonical(contract.acceptanceScope) !== canonical(state.originalAcceptanceScope)) fail('SCOPE', 'Original accepted scope does not match its immutable contract.');
    }
    if (canonical(state.contractHistory.at(-1)) !== canonical(state.contract)) fail('CONTRACT', 'Current contract does not match the last immutable amendment.');
    if (fs.existsSync(safePath(loc.root, loc.goalDirectory + '/evidence'))) for (const file of fs.readdirSync(path.join(loc.goal, 'evidence'))) if (!state.resources.some(r => r.path === 'evidence/' + file)) outstanding.push({ code: 'ORPHAN', message: 'Unregistered evidence requires inspection: ' + file });
    fingerprintInputs(options);
    const latest = governingAssessments(options);
    for (const [obligationId, assessment] of latest) if (assessment.receipt?.result === 'PASS') { covered.add(obligationId); if (!validReceiptIds.includes(assessment.receipt.receiptId)) validReceiptIds.push(assessment.receipt.receiptId); }
    const phases = options.phaseId ? state.phases.filter(p => p.phaseId === options.phaseId) : state.phases;
    if (!phases.length) fail('BINDING', 'Unknown phaseId.');
    const gateIds = new Set(phases.flatMap(p => p.gates.map(g => g.gateId)));
    if (!options.phaseId) for (const item of state.acceptanceScope) if (!state.phases.some(p => p.gates.some(g => g.obligations.some(o => o.kind === 'acceptance' && o.coverage.includes(item))))) outstanding.push({ code: 'UNKNOWN_OBLIGATION', acceptanceId: item, message: 'Accepted scope has no receiving acceptance obligation: ' + item, nextAction: 'Add the missing acceptance obligation for ' + item + ' through an amendment, then verify it; preserve the original scope.' });
    for (const phase of phases) for (const gate of phase.gates) {
      if (gate.budget.history === 'unknown') outstanding.push({ code: 'UNKNOWN_BUDGET', gateId: gate.gateId, message: 'Review history is unknown.', nextAction: 'Inspect retained review history for gate ' + gate.key + ' and record its confirmed consumed allowance before another dispatch.' });
      for (const obligation of gate.obligations) if (!covered.has(obligation.obligationId)) {
        const assessment = latest.get(obligation.obligationId), stale = assessment?.error;
        const retryAvailable = reviewBatches(gate).some(n => !gate.budget.consumedBatches.includes(n));
        const action = isReview(obligation) ? retryAvailable ? `Reserve the missing independent ${obligation.key} review within this gate's retained allowance and record its actual result.` : `Report the residual ${obligation.key} review and request a bounded gate-scoped approval before recording an extension or dispatching again.` : obligation.kind === 'check' ? `Run the declared check ${obligation.key}: ${obligation.command}; record its actual result.` : `Verify ${obligation.key} (${obligation.kind}) against the accepted scope and record the evidence.`;
        outstanding.push({ code: stale ? 'STALE' : assessment ? 'FAILED' : 'OWED', gateId: gate.gateId, obligationId: obligation.obligationId, kind: obligation.kind, ...(assessment ? { attemptId: assessment.attempt.attemptId, receiptId: assessment.reference.receiptId } : {}), ...(stale ? { reasonCode: stale.code || 'INVALID', changedInputs: stale.changedInputs || [] } : {}), message: stale ? `${obligation.key}: ${stale.message}` : assessment ? `${obligation.key}: an unresolved governing assessment returned ${assessment.receipt.result}.` : 'Current successful evidence is owed for ' + obligation.key, nextAction: (stale ? 'Inspect the changed or unavailable evidence inputs first. ' : '') + action });
      }
    }
    for (const attempt of state.attempts) if (gateIds.has(attempt.gateId) && attempt.status === 'pending') outstanding.push({ code: 'PENDING', attemptId: attempt.attemptId, message: 'A reserved attempt has no terminal evidence; preserve its consumed allowance.', nextAction: 'Reconcile attempt ' + attempt.attemptId + ' from actual execution evidence and record its completed, interrupted or unverified result before any retry.' });
    for (const finding of state.findings.filter(f => gateIds.has(f.gateId) || (options.phaseId && f.deferral?.receivingPhaseId === options.phaseId))) {
      if (finding.disposition === 'deferred') {
        try {
          const receiving = validateDeferralShape(state, finding); validateDeferralEvidence(options, finding);
          const selectedIndex = options.phaseId ? state.phases.findIndex(p => p.phaseId === options.phaseId) : -1;
          if (options.phaseId && selectedIndex < state.phases.indexOf(receiving) && receiving.enteredRevision == null) continue;
          outstanding.push({ code: 'DEFERRED', findingId: finding.findingId, gateId: finding.gateId, receivingPhaseId: receiving.phaseId, severity: finding.severity, message: 'Deferred work remains owed at phase ' + receiving.key + ': ' + finding.description, nextAction: 'Enter the named receiving phase through its authorized phase-entry amendment, then address this same finding using its original gate and retained review allowance.' });
        } catch (error) { outstanding.push({ code: 'STALE_DEFERRAL', findingId: finding.findingId, gateId: finding.gateId, receivingPhaseId: finding.deferral?.receivingPhaseId || null, message: 'Deferral proof is unavailable or no longer applicable: ' + error.message, nextAction: 'Inspect the retained reachability/risk evidence and refresh the same-phase deferral assessment or address the finding; do not erase its scope or history.' }); }
        continue;
      }
      let validProof = false;
      if (finding.disposition === 'resolved' && finding.proofReceiptIds?.length && finding.proofReceiptIds.every(x => validReceiptIds.includes(x))) {
        try { validateFindingProof(options, finding, latest); validProof = true; } catch { /* A prior resolution never bypasses current applicability. */ }
      }
      if (finding.disposition === 'resolved' && !validProof) outstanding.push({ code: 'STALE_RESOLUTION', findingId: finding.findingId, severity: finding.severity, message: 'Finding resolution proof is stale, absent or inapplicable to its current version.', nextAction: 'Inspect finding ' + finding.findingId + ' and obtain applicable check/review proof within the retained allowance before resolving it again.' });
      else if (finding.disposition !== 'resolved' && ['Critical', 'High', 'Medium'].includes(finding.severity)) outstanding.push({ code: 'FINDING', findingId: finding.findingId, severity: finding.severity, message: finding.description, nextAction: 'Address finding ' + finding.findingId + ' with its owner, then record the applicable validation and independent review within the retained allowance.' });
    }
  } catch (error) { outstanding.push({ code: error.code || 'INVALID', message: error.message, nextAction: error.nextAction || 'Inspect the selected snapshot and retained evidence; use manual verification until its integrity is restored.' }); }
  const priority = { LOCKED: 0, UNKNOWN_BUDGET: 1, PENDING: 2, STALE_RESOLUTION: 3, STALE_DEFERRAL: 3, DEFERRED: 4, FINDING: 4, STALE: 5, FAILED: 6, OWED: 7 };
  outstanding.sort((a, b) => (priority[a.code] ?? 0) - (priority[b.code] ?? 0));
  const onlyMedium = outstanding.length > 0 && outstanding.every(x => x.code === 'FINDING' && x.severity === 'Medium');
  const readiness = !outstanding.length ? 'Ready' : onlyMedium ? 'Almost' : 'Not yet';
  const selected = options.phaseId && Array.isArray(state?.phases) && state.phases.find(p => p.phaseId === options.phaseId);
  return { readiness, assessmentScope: { kind: options.phaseId ? 'phase' : 'goal', goalId: state?.goalId || null, phaseId: options.phaseId || null, title: selected?.title || state?.title || 'Unverified workflow' }, wholeGoalReadiness: options.phaseId ? 'not evaluated' : readiness, outstanding, validReceiptIds, coveredObligationIds: [...covered], nextAction: outstanding.length ? outstanding[0].nextAction || 'Inspect the named evidence gap and preserve existing history before continuing.' : options.phaseId ? 'Report this phase result, then inspect whole-goal status before claiming the original goal complete.' : 'Report the completed goal with its current evidence and required documentation.' };
}

module.exports = { SCHEMA_VERSION, LIMITS, KINDS, RESULTS, SEVERITIES, isReview, validateSlotGraph, reviewBatches, findingVersions, validateFindingProof, validateExecutionEvidence, validateRisk, validateDeferralShape, validateDeferralEvidence, WorkflowError, fail, object, string, list, strings, unique, integer, oneOf, id, hash, hashString, canonical, digest, relative, within, location, safePath, readBounded, readJSON, captureContract, validateWorkflow, findGate, loadWorkflow, fingerprintInputs, assessmentFingerprint, deriveReadiness, resourceData, receiptData, currentReceipt, project, loadInstallReceipt };
