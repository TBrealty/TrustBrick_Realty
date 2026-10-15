/**
 * GSTIN (India's GST identification number): 15 characters.
 *
 * - 2 digits: the state code (01 to 38, or 97 for "other territory").
 * - 10 characters: the business's PAN.
 * - 1 character: the entity number for that PAN in the state (1 to 9, then A to Z).
 * - The letter Z.
 * - A check character computed from the other 14.
 *
 * Pure, so the website and the app check it the same way.
 */
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Upper case, without spaces or dashes. */
export function normalizeGstin(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/** The check character for the first 14 characters of a GSTIN. */
export function gstinCheckCharacter(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

/** Why a GSTIN isn't valid, or null when it is. */
export function gstinProblem(value: string): string | null {
  const gstin = normalizeGstin(value);
  if (gstin.length !== 15) return "A GST number has 15 characters";
  if (!SHAPE.test(gstin)) return "That doesn't look like a GST number (for example 27AAPFU0939F1ZV)";
  const state = Number(gstin.slice(0, 2));
  if (!((state >= 1 && state <= 38) || state === 97)) return "The first two digits should be your state's GST code";
  if (gstinCheckCharacter(gstin.slice(0, 14)) !== gstin[14]) return "This GST number has a typo: please check it against your GST certificate";
  return null;
}

/** The PAN inside a GSTIN. */
export const panFromGstin = (gstin: string) => normalizeGstin(gstin).slice(2, 12);
