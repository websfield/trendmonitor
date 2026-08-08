/**
 * Technical QA — the hard gate between a render and everything downstream
 * (PRD REQ-100/084/104/106, tech-spec §15 step 7, decisions.md D-35).
 *
 * Three layers, kept apart on purpose: `measure` produces numbers, `checks`
 * turns numbers into findings, `gate` turns findings into a status. The middle
 * layer is pure, which is what makes the "every check has a positive and a
 * negative fixture" acceptance criterion reachable without 46 rendered videos.
 */

export {
  ALL_CHECK_IDS,
  loadQaRuleset,
  parseQaRuleset,
  loadSafeZoneOverlay,
  severityOf,
  QaConfigError,
  type QaRuleset,
  type QaCheckId,
  type QaCheckRecord,
  type QaGateStatus,
  type TechnicalQaFinding,
  type TechnicalQaReport,
  type RenderMeasurements,
  type LoudnessMeasurement,
  type SafeZoneOverlay,
  type NormalisedRect,
  type TimeRun,
} from './model.js';

export {
  evaluateChecks,
  estimateCaptionBox,
  type QaContext,
  type QaEvaluation,
  type QaCaptionCue,
  type QaCaptionReviewFlag,
  type QaNonSpeechEvent,
  type QaSourceRangeViolation,
  type CheckOutcome,
  type CaptionBox,
} from './checks.js';

export {
  computeGateStatus,
  assembleTechnicalQaReport,
  qaAllowsAdvance,
  QaWaiverRejected,
  type GateResult,
  type QaWaiver,
  type AssembleReportInput,
} from './gate.js';

export {
  measureRender,
  parseBlackRuns,
  parseFreezeRuns,
  parseSilenceRuns,
  parsePeakDbfs,
  parseContentRect,
  type MeasureInput,
} from './measure.js';
