export function learningOptions(options?: { signal?: AbortSignal }) {
  return {
    ...options,
    headers: { "X-TSZ-Learning-Capabilities": "choice-v1" }
  };
}
