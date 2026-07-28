/**
 * Minimal ambient typing for Node's built-in `node:sqlite` (DatabaseSync).
 *
 * The repo pins `@types/node` at 20.19.43 (decisions.md D-39), which predates
 * the `node:sqlite` typings that ship with @types/node >= 22.5. Bumping the
 * whole workspace's @types/node inside this phase is exactly the churn D-44
 * warns against, so we declare only the subset this package calls. The runtime
 * module is present in Node 24 (decisions.md D-45); this file only teaches the
 * type-checker its shape.
 *
 * Kept deliberately narrow: if a future change reaches for another method, add
 * it here rather than widening to `any`.
 */
declare module 'node:sqlite' {
  interface StatementSync {
    run(...params: Array<string | number | bigint | null>): {
      changes: number | bigint;
      lastInsertRowid: number | bigint;
    };
    get(...params: Array<string | number | bigint | null>): Record<string, unknown> | undefined;
    all(...params: Array<string | number | bigint | null>): Array<Record<string, unknown>>;
  }

  interface DatabaseSyncOptions {
    open?: boolean;
    readOnly?: boolean;
  }

  class DatabaseSync {
    constructor(path: string, options?: DatabaseSyncOptions);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
