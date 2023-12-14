export function pad(s: string, l: number): string {
  return (s + " ".repeat(l)).slice(0, l);
}
