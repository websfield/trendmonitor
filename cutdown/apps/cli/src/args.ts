import { parseArgs } from 'node:util';

/**
 * Argument parsing built on `node:util`'s `parseArgs`.
 *
 * No commander/yargs: golden rule 5 asks a new dependency to answer something
 * the standard library cannot, and for `--flag value` plus positionals it
 * cannot. What `parseArgs` does not give is subcommand routing, so that small
 * piece lives here.
 */

export interface OptionSpec {
  type: 'string' | 'boolean';
  multiple?: boolean;
  short?: string;
}

/** What `parseArgs` can hand back for a single flag. */
export type OptionValue = string | boolean | Array<string | boolean> | undefined;

export function parse(
  argv: string[],
  optionSpec: Record<string, OptionSpec>,
): { positionals: string[]; options: Record<string, OptionValue> } {
  const { values, positionals } = parseArgs({
    args: argv,
    options: optionSpec,
    allowPositionals: true,
    // An unknown flag is a mistake worth stopping for. Silently ignoring
    // `--tier finl` would render a draft while the operator believed otherwise.
    strict: true,
  });
  return { positionals, options: values };
}

/** Read a required string option, failing with the flag name the user must supply. */
export function requireString(
  options: Record<string, unknown>,
  name: string,
  hint: string,
): string {
  const value = options[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing required option --${name}. ${hint}`);
  }
  return value;
}

/** Read a required positional by index, failing with what it should have been. */
export function requirePositional(positionals: string[], index: number, name: string): string {
  const value = positionals[index];
  if (value === undefined || value.length === 0) {
    throw new Error(`Missing required argument <${name}>.`);
  }
  return value;
}
