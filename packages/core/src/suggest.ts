// "Did you mean ...?" for a name that is not one hinote knows.

// Edits between two names: a letter added, removed, or changed, or two
// neighbors swapped, each counts as one. Case does not count.
function distance(a: string, b: string): number {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const rows = Array.from({ length: a.length + 1 }, (_row, i) =>
    Array.from({ length: b.length + 1 }, (_cell, j) =>
      i === 0 ? j : j === 0 ? i : 0,
    ),
  );
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const row = rows[i]!;
      const above = rows[i - 1]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(above[j]! + 1, row[j - 1]! + 1, above[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        row[j] = Math.min(row[j]!, rows[i - 2]![j - 2]! + 1);
    }
  return rows[a.length]![b.length]!;
}

// The candidate nearest to what was written, or nothing when every one is
// too far to be a slip: more than a third of its length in edits, at least
// one. A candidate the name begins, such as "pres" for "presenter", counts.
// `spelling` gives the part of a candidate to compare, for a candidate that
// says where the name goes, such as "document.aspect" for "aspect".
export function closest(
  name: string,
  candidates: Iterable<string>,
  spelling: (candidate: string) => string = (candidate) => candidate,
): string | undefined {
  let best: { candidate: string; edits: number } | undefined;
  for (const candidate of candidates) {
    const word = spelling(candidate);
    const edits =
      name.length >= 3 && word.toLowerCase().startsWith(name.toLowerCase())
        ? 1
        : distance(name, word);
    if (edits <= Math.max(1, Math.floor(word.length / 3)))
      if (!best || edits < best.edits) best = { candidate, edits };
  }
  return best?.candidate;
}

// The hint for an unknown name: the nearest of `known`, else all of them.
// `elsewhere` are names that belong in another place, offered when near but
// not listed, such as "document.aspect" for a deck's "aspect".
export function didYouMean(
  name: string,
  known: readonly string[],
  elsewhere: readonly string[] = [],
): string {
  const near = closest(name, [...known, ...elsewhere], (candidate) =>
    candidate.slice(candidate.lastIndexOf(".") + 1),
  );
  return near === undefined
    ? `It takes ${known.map((c) => `"${c}"`).join(", ")}.`
    : `Did you mean "${near}"?`;
}
