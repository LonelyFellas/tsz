/** Match PostgreSQL btrim(word): only ASCII spaces are removed, not tabs/newlines. */
export function wordlistAudioWord(word: string): string {
  return word.replace(/^[ ]+|[ ]+$/g, "");
}
