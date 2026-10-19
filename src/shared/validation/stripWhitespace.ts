// Match Unicode White_Space, including NEL, rather than JavaScript's broader trim set.
export function stripWhitespace(value: string): string {
  return value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '');
}
