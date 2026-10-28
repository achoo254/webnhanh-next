/**
 * The checks the server applies to build settings (`checkRelativeDir` and `checkBuildCommand` of the worker's build
 * settings), run while the developer types so a mistake shows at its own field. The server stays the authority: its
 * `build-settings` refusal names the same fields (`serverSettingsErrors`).
 */
import type { BuildSettings } from '../builds-api';
import type { MessageKey } from '../i18n';

export type SettingsField = 'rootDir' | 'buildCommand' | 'outputDir';
export type SettingsErrors = Partial<Readonly<Record<SettingsField, MessageKey>>>;

export const SETTINGS_FIELDS: readonly SettingsField[] = ['rootDir', 'buildCommand', 'outputDir'];
export const MAX_DIR_LENGTH = 200;
export const MAX_COMMAND_LENGTH = 300;

const DIR_PATTERN = /^[A-Za-z0-9._@+-]+(?:\/[A-Za-z0-9._@+-]+)*$/;

/** A folder inside the project: empty (the folder itself), or `a/b` without `.`/`..` parts. */
function dirAllowed(input: string): boolean {
  const value = input.trim().replace(/^\.\/+/, '').replace(/\/+$/, '');
  if (value === '' || value === '.') return true;
  if (value.length > MAX_DIR_LENGTH || !DIR_PATTERN.test(value)) return false;
  return !value.split('/').some((part) => part === '.' || part === '..');
}

/** Empty (plain HTML), or one line of printable text. */
function commandAllowed(input: string | null): boolean {
  const value = input?.trim() ?? '';
  // eslint-disable-next-line no-control-regex
  return value.length <= MAX_COMMAND_LENGTH && !/[\u0000-\u001f\u007f]/.test(value);
}

export function settingsErrors(settings: BuildSettings): SettingsErrors {
  return {
    ...(dirAllowed(settings.rootDir) ? {} : { rootDir: 'deploy.dir.error' }),
    ...(commandAllowed(settings.buildCommand) ? {} : { buildCommand: 'deploy.buildCommand.error' }),
    ...(dirAllowed(settings.outputDir) ? {} : { outputDir: 'deploy.dir.error' }),
  };
}

const SERVER_FIELDS: Readonly<Record<string, SettingsField>> = { 'root-dir': 'rootDir', 'build-command': 'buildCommand', 'output-dir': 'outputDir' };

/** The fields a `build-settings` refusal names, as the same errors the form shows. */
export function serverSettingsErrors(fields: readonly string[]): SettingsErrors {
  const errors: Partial<Record<SettingsField, MessageKey>> = {};
  for (const code of fields) {
    const field = SERVER_FIELDS[code];
    if (field) errors[field] = field === 'buildCommand' ? 'deploy.buildCommand.error' : 'deploy.dir.error';
  }
  return errors;
}

/** A field's text as typed: the build command's `null` (plain HTML) is an empty box. */
export function fieldText(settings: BuildSettings, field: SettingsField): string {
  return field === 'buildCommand' ? (settings.buildCommand ?? '') : settings[field];
}

export function withField(settings: BuildSettings, field: SettingsField, text: string): BuildSettings {
  if (field === 'buildCommand') return { ...settings, buildCommand: text === '' ? null : text };
  return { ...settings, [field]: text };
}

export function sameSettings(a: BuildSettings, b: BuildSettings): boolean {
  return SETTINGS_FIELDS.every((field) => fieldText(a, field).trim() === fieldText(b, field).trim());
}
