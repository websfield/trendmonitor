'use strict';
// Is this master plan reviewed and READY to build? Reads the plan's "Plan Review Log" table and
// judges its LAST verdict row. Read-only; fs + path only; never runs anything.
//   node .claude/scripts/plan-ready.js docs/plans/<feature>-master-plan.md
// Prints one line whose first word is the contract:
//   READY: ...        exit 0   last verdict row is READY (and not NOT READY)
//   NOT READY: ...    exit 1   last row NOT READY / STALE / PENDING / BLOCK / PASS (the plan gate's ready word is READY), no log, no Verdict column, empty table
//   UNCHECKED: ...    exit 0   no argument, file missing or unreadable (fail-open: read the log yourself)
const fs = require('node:fs');
const path = require('node:path');

const out = (line, code) => { process.stdout.write(line + '\n'); process.exitCode = code; };
const cells = (row) => row.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.replace(/[*_`]/g, '').trim());

function check(file) {
  if (!file) return out('UNCHECKED: no plan path given.', 0);
  let text;
  try { text = fs.readFileSync(path.resolve(file), 'utf8'); } catch (error) { return out(`UNCHECKED: cannot read ${file} (${error.code || error.message}).`, 0); }
  text = text.replace(/\r\n/g, '\n').replace(/<!--[\s\S]*?(?:-->|$)/g, '').replace(/```[\s\S]*?(?:```|$)/g, '');
  const heading = /^#{1,6}\s*[*_]*Plan[ -]?review[ -]?log\b.*$/im.exec(text);
  if (!heading) return out(`NOT READY: no Plan Review Log in ${file}.`, 1);
  const rest = text.slice(heading.index + heading[0].length);
  const next = /^#{1,6}\s/m.exec(rest);
  const rows = rest.slice(0, next ? next.index : undefined).split('\n').filter((line) => /^\s*\|/.test(line));
  if (!rows.length) return out('NOT READY: Plan Review Log has no table.', 1);
  const header = cells(rows[0]);
  const verdictAt = header.findIndex((cell) => /^verdict/i.test(cell));
  if (verdictAt < 0) return out('NOT READY: Plan Review Log has no Verdict column.', 1);
  const col = (name) => header.findIndex((cell) => new RegExp('^' + name, 'i').test(cell));
  const roundAt = col('round'), reviewerAt = col('reviewer'), dateAt = col('date');
  const verdicts = rows.slice(1).map(cells)
    .filter((row) => !row.every((cell) => /^:?-{2,}:?$/.test(cell)))
    .map((row, index) => ({ row, index, verdict: row[verdictAt] || '' }))
    .filter(({ verdict }) => /\b(NOT\s+READY|READY|STALE|PENDING|BLOCK|NEEDS\s+CHANGES|PASS)\b/i.test(verdict));
  if (!verdicts.length) return out('NOT READY: no plan-review run recorded.', 1);
  const last = verdicts[verdicts.length - 1];
  const where = `round ${roundAt >= 0 && last.row[roundAt] ? last.row[roundAt] : last.index + 1}`
    + (reviewerAt >= 0 && last.row[reviewerAt] ? ` · ${last.row[reviewerAt]}` : '')
    + (dateAt >= 0 && last.row[dateAt] ? ` · ${last.row[dateAt]}` : '');
  const ready = /\bREADY\b/i.test(last.verdict) && !/\b(?:NOT\s+READY|STALE|PENDING)\b/i.test(last.verdict);
  return ready ? out(`READY: ${where}`, 0) : out(`NOT READY: last verdict "${last.verdict}" (${where}).`, 1);
}

if (require.main === module) {
  try { check(process.argv[2]); } catch (error) { out(`UNCHECKED: ${error.message}`, 0); }
}
module.exports = { check };
