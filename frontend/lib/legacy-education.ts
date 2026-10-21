/**
 * Legacy single-qualification fields (highest_education, institution, discipline, …) vs. education[].
 *
 * The onboarding and profile forms still write the legacy fields as a copy of one education[] entry,
 * so for current profiles they are usually a duplicate. The admin profile shows them only when they
 * add information: legacy-only profiles, or legacy values that match no education[] entry.
 *
 * Kept free of Next.js / path-alias imports so it can be unit tested with `node --test`
 * (see tests/legacy-education.test.mjs).
 */

type Text = string | null | undefined;

export interface EducationEntryLike {
  level?: Text;
  discipline?: Text;
  disciplineOther?: Text;
  status?: Text;
  institution?: Text;
}

export interface LegacyEducationLike {
  highestEducation?: Text;
  institution?: Text;
  discipline?: Text;
  disciplineOther?: Text;
  educationStatus?: Text;
}

const normalize = (value: Text): string => (typeof value === "string" ? value.trim().toLowerCase() : "");

export function hasLegacyEducation(legacy: LegacyEducationLike): boolean {
  return Object.values(legacy).some((value) => normalize(value) !== "");
}

/** True when every non-empty legacy field equals the matching field of this entry (case/whitespace-insensitive). */
export function legacyMatchesEntry(legacy: LegacyEducationLike, entry: EducationEntryLike): boolean {
  const pairs: [Text, Text][] = [
    [legacy.highestEducation, entry.level],
    [legacy.institution, entry.institution],
    [legacy.discipline, entry.discipline],
    [legacy.disciplineOther, entry.disciplineOther],
    [legacy.educationStatus, entry.status],
  ];
  return pairs.every(([legacyValue, entryValue]) => normalize(legacyValue) === "" || normalize(legacyValue) === normalize(entryValue));
}

/** Show the legacy fields unless they are absent or duplicate an education[] entry. */
export function shouldShowLegacyEducation(legacy: LegacyEducationLike, education: EducationEntryLike[]): boolean {
  if (!hasLegacyEducation(legacy)) return false;
  if (education.length === 0) return true;
  return !education.some((entry) => legacyMatchesEntry(legacy, entry));
}
