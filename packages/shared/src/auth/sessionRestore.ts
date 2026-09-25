import { HttpError } from "@tsz/api-client";
import { SessionChangedError, type TokenManager } from "./tokenManager";

export function createSessionRestore<T>(
  tokens: TokenManager,
  load: () => Promise<T>,
  apply: (session: T) => void,
  absent: () => void,
  failed: () => void
): () => Promise<void> {
  let pending: { generation: number; promise: Promise<void> } | undefined;
  return () => {
    const generation = tokens.getSessionGeneration();
    if (pending?.generation === generation) return pending.promise;
    const promise = (async () => {
      try {
        if (!tokens.getToken()) await tokens.refreshTokens();
        if (generation !== tokens.getSessionGeneration()) return;
        const session = await load();
        if (generation !== tokens.getSessionGeneration()) return;
        apply(session);
      } catch (error) {
        if (
          generation !== tokens.getSessionGeneration() ||
          error instanceof SessionChangedError
        )
          return;
        if (error instanceof HttpError && error.status === 401) {
          tokens.setAccessToken(null);
          absent();
          return;
        }
        failed();
        throw error;
      }
    })().finally(() => {
      if (pending?.promise === promise) pending = undefined;
    });
    pending = { generation, promise };
    return promise;
  };
}
