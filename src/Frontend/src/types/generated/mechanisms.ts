// GENERATED FILE — do not edit. Source: docs/initial/schemas/*.json
// Regenerate with `npm run gen:types`. Widening a type here by hand is a contract breach.

export interface Mechanism {
  id: string;
  statement: string;
  feature_predicate: Record<string, unknown>;
  falsifier: string;
  warrant: "conjectured" | "recurrent" | "contrasted" | "falsified" | "retired";
  evidence: {
    n_exemplars: number;
    n_creators: number;
    n_cohorts: number;
    n_trends: number;
    prevalence_in_top_decile: number;
    prevalence_in_contrast_set: number;
    prevalence_ratio: number;
    contrast_set_definition: string;
    temporal_slices: Record<string, unknown>[];
  };
  provenance: {
    corpus_selection: "Proxy";
    predicate_evaluation: "Measured";
    label: "Proxy-selected, Measured-evaluated";
  };
  never_tested_against?: "content that was attempted and failed";
  occasioned_by_trend_ids?: string[];
  ingestion_arm: "trend_directed" | "uniform" | "mixed";
  ratified_by: string;
  ratified_at: string;
  ratification_note: string;
  superseded_by?: string | null;
  valid_from: string;
  valid_to: string;
}

export interface LibraryManifest {
  mechanism_library_version: string;
  vertical: string;
  platform: string;
  cut_at: string;
  published_at: string;
  supersedes?: string | null;
  compatible_extractor_versions: string[];
  corpus_snapshot_sha256: string;
  mechanisms: Mechanism[];
  exemplar_index_uri?: string;
  sha256: string;
}

/** mechanisms-v1.json warrant ladder */
export type Warrant =
  | "conjectured"
  | "recurrent"
  | "contrasted"
  | "falsified"
  | "retired";
