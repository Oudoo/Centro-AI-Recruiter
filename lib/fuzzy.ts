/**
 * Computes the Levenshtein distance between two strings.
 */
export function getLevenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array(b.length + 1).fill(0)
  );

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1, // Deletion
          matrix[i][j - 1] + 1, // Insertion
          matrix[i - 1][j - 1] + 1 // Substitution
        );
      }
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Normalizes name strings and returns a similarity score from 0 to 100.
 * Handles casing, trailing spaces, and standard variations in transliterated names.
 */
export function getNameSimilarity(name1: string, name2: string): number {
  const n1 = name1.toLowerCase().trim().replace(/\s+/g, " ");
  const n2 = name2.toLowerCase().trim().replace(/\s+/g, " ");

  if (n1 === n2) return 100;
  if (!n1 || !n2) return 0;

  const distance = getLevenshteinDistance(n1, n2);
  const maxLength = Math.max(n1.length, n2.length);

  return Math.round((1 - distance / maxLength) * 100);
}
