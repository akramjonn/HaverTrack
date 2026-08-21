/**
 * Imperial/metric conversions and formatting, shared by every screen that
 * shows or edits height/weight. `profiles.units` is the single source of
 * truth for which system a user sees — this file never guesses.
 *
 * All DB storage stays kg/cm regardless of the display unit; only these
 * formatters/parsers convert at the edges.
 */

import { useAuthStore } from '@/store/authStore';

export type Units = 'imperial' | 'metric';

export function kgToLb(kg: number): number {
  return kg * 2.20462;
}

export function lbToKg(lb: number): number {
  return lb * 0.45359237;
}

export function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalInches = cm / 2.54;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round(totalInches - feet * 12);
  if (inches === 12) {
    feet += 1;
    inches = 0;
  }
  return { feet, inches };
}

export function ftInToCm(feet: number, inches: number): number {
  return Math.round((feet * 12 + inches) * 2.54);
}

/** '165.4 lb' | '75.0 kg'. Returns an em dash when the value is missing. */
export function formatWeight(kg: number | null | undefined, units: Units): string {
  if (kg === null || kg === undefined || !Number.isFinite(kg) || kg <= 0) return '—';
  if (units === 'imperial') return `${kgToLb(kg).toFixed(1)} lb`;
  return `${kg.toFixed(1)} kg`;
}

/** `5' 10"` | '178 cm'. Returns an em dash when the value is missing. */
export function formatHeight(cm: number | null | undefined, units: Units): string {
  if (cm === null || cm === undefined || !Number.isFinite(cm) || cm <= 0) return '—';
  if (units === 'imperial') {
    const { feet, inches } = cmToFtIn(cm);
    return `${feet}' ${inches}"`;
  }
  return `${Math.round(cm)} cm`;
}

/**
 * Moved verbatim from `(onboarding)/about.tsx`. Accepts ft/in text
 * ("5ft 10in", "5'10", "5 10") and falls back to treating the whole string
 * as a plain number. Returns null on unrecognized input rather than
 * throwing — the empty state is a real, expected case.
 */
export function parseHeightToCm(text: string): number | null {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return null;

  const match = trimmed.match(/(\d+)\s*(?:ft|'|foot)?\s*(\d+)?\s*(?:in|"|inches)?/);
  if (match && match[1]) {
    const feet = parseInt(match[1], 10);
    const inches = match[2] ? parseInt(match[2], 10) : 0;
    return Math.round((feet * 12 + inches) * 2.54);
  }

  const num = parseFloat(trimmed);
  return isNaN(num) ? null : num;
}

/**
 * Unit-aware height input parsing for editable surfaces (e.g. Settings).
 * `parseHeightToCm`'s ft/in regex misreads a plain metric number like "178"
 * as 178 feet, so metric entry is parsed as a plain cm number instead.
 * Imperial entry still goes through the ft/in-aware `parseHeightToCm`.
 */
export function parseHeightInput(text: string, units: Units): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (units === 'metric') {
    const num = parseFloat(trimmed);
    return isNaN(num) || num <= 0 ? null : Math.round(num);
  }
  return parseHeightToCm(text);
}

/** Reads the leading numeric portion of `text` in the given unit system. */
export function parseWeightToKg(text: string, units: Units): number | null {
  const num = parseFloat(text.trim());
  if (isNaN(num) || num <= 0) return null;
  const kg = units === 'imperial' ? lbToKg(num) : num;
  return Math.round(kg * 10) / 10;
}

/** Reads `profiles.units`, defaulting to imperial for a not-yet-loaded profile. */
export function useUnits(): Units {
  return useAuthStore((s) => s.profile?.units ?? 'imperial');
}
