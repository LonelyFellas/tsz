export function learningOptions(options?: { signal?: AbortSignal }) {
  return {
    ...options,
    headers: {
      "X-TSZ-Learning-Capabilities":
        "choice-v1,mastery-v1,wordlist-spelling-v1,strict-choice-v1"
    }
  };
}
