/** Shows a stored grade such as "jhs 1" the way schools write it: "JHS 1". */
export function formatGrade(grade: string | null | undefined) {
  const value = (grade ?? '').trim();
  if (!value) return '';
  return value.replace(/\b([a-z]{2,4})\b/gi, (word) => (/^(jhs|shs|kg|bs|p|gr)$/i.test(word) ? word.toUpperCase() : word));
}
