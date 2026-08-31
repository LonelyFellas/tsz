import type {
  AdminWordV3,
  AdminWordV3Envelope,
  DraftFormsStepContentV3,
  FormsImpactResponseV3,
  SurfaceMatchPageV3,
  SurfacePolicyNameV2
} from "@tsz/types";
import { classifyV3Problem, invalidatesV3Confirmations } from "./problem";

export type V3CanonicalCommand =
  "save_forms" | "save_meanings" | "save_sentence_associations" | "publish";
export type V3RequestCommand =
  V3CanonicalCommand | "detect" | "surface" | "impact" | "validate";

export interface V3ConfirmationContext {
  base_revision: number;
  snapshot_id?: string;
  policy_name?: SurfacePolicyNameV2;
  policy_epoch?: number;
  impact_content?: DraftFormsStepContentV3;
}

export interface V3ConfirmationTokens {
  confirmed_surface_match_token?: string;
  confirmed_impact_token?: string;
}

interface SurfaceConfirmationBinding {
  base_revision: number;
  content_digest: string;
  content_fingerprint: string;
  snapshot_id: string;
  policy_name: SurfacePolicyNameV2;
  policy_epoch: number;
  token: string;
}

interface ImpactConfirmationBinding {
  base_revision: number;
  content_digest: string;
  content_fingerprint: string;
  token: string;
}

interface ImpactPreviewBinding {
  base_revision: number;
  content_digest: string;
  content_fingerprint: string;
  requires_confirmation: boolean;
  snapshot_id: string;
  policy_name: SurfacePolicyNameV2;
  policy_epoch: number;
}

export interface V3CanonicalCommandResult {
  accepted: boolean;
  value: AdminWordV3Envelope;
}

export interface V3RequestResult<T> {
  accepted: boolean;
  value: T;
}

export interface V3SaveFlow {
  canonical(): AdminWordV3;
  isPending(command: V3RequestCommand): boolean;
  runRequest<T>(
    command: V3RequestCommand,
    request: () => Promise<T>
  ): Promise<V3RequestResult<T>>;
  runCanonical(
    command: V3CanonicalCommand,
    request: () => Promise<AdminWordV3Envelope>
  ): Promise<V3CanonicalCommandResult>;
  bindSurfaceConfirmation(
    page: SurfaceMatchPageV3,
    content: DraftFormsStepContentV3
  ): boolean;
  bindImpactConfirmation(
    impact: FormsImpactResponseV3,
    content: DraftFormsStepContentV3
  ): boolean;
  bindImpactSurfaceConfirmation(page: SurfaceMatchPageV3): boolean;
  confirmations(context?: V3ConfirmationContext): V3ConfirmationTokens;
  supersede(): void;
  dispose(): void;
}

function normalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) =>
      item === undefined ? null : normalizeJson(item)
    );
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, item]) => [key, normalizeJson(item)])
    );
  }
  return value;
}

/** Stable local fingerprint of the exact forms body used for impact preview. */
function formsContentFingerprint(content: DraftFormsStepContentV3): string {
  return JSON.stringify(normalizeJson(content));
}

export function formsContentDigest(content: DraftFormsStepContentV3): string {
  const serialized = formsContentFingerprint(content);
  let hash = 0x811c9dc5;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/**
 * Owns only server-confirmed state. Form input stays in component state, so a
 * failed command cannot erase edits or pretend that an optimistic change was
 * persisted.
 */
export function createV3SaveFlow(initialWord: AdminWordV3): V3SaveFlow {
  let canonicalWord = initialWord;
  let generation = 0;
  let disposed = false;
  let surfaceBinding: SurfaceConfirmationBinding | undefined;
  let impactBinding: ImpactConfirmationBinding | undefined;
  let impactPreviewBinding: ImpactPreviewBinding | undefined;
  const pending = new Map<
    V3RequestCommand,
    Promise<V3RequestResult<unknown>>
  >();

  const invalidateConfirmations = () => {
    surfaceBinding = undefined;
    impactBinding = undefined;
    impactPreviewBinding = undefined;
  };

  const exactContentBinding = (content: DraftFormsStepContentV3) => ({
    base_revision: canonicalWord.revision,
    content_digest: formsContentDigest(content),
    content_fingerprint: formsContentFingerprint(content)
  });

  const bindSurfacePage = (
    page: SurfaceMatchPageV3,
    content: Pick<
      SurfaceConfirmationBinding,
      "base_revision" | "content_digest" | "content_fingerprint"
    >
  ): boolean => {
    surfaceBinding = undefined;
    if (
      content.base_revision !== canonicalWord.revision ||
      page.continuation_policy !== "enabled" ||
      page.next_cursor !== null
    ) {
      return false;
    }
    surfaceBinding = {
      ...content,
      snapshot_id: page.snapshot_id,
      policy_name: page.policy_name,
      policy_epoch: page.policy_epoch,
      token: page.surface_confirmation_token
    };
    return true;
  };

  const bindImpactSurfacePage = (page: SurfaceMatchPageV3): boolean => {
    surfaceBinding = undefined;
    impactBinding = undefined;
    const preview = impactPreviewBinding;
    if (
      page.continuation_policy !== "enabled" ||
      page.next_cursor !== null ||
      !preview ||
      preview.base_revision !== canonicalWord.revision ||
      page.snapshot_id !== preview.snapshot_id ||
      page.policy_name !== preview.policy_name ||
      page.policy_epoch !== preview.policy_epoch ||
      !bindSurfacePage(page, preview)
    ) {
      return false;
    }
    if (!preview.requires_confirmation) return true;
    if (!page.impact_confirmation_token) return false;
    impactBinding = {
      base_revision: preview.base_revision,
      content_digest: preview.content_digest,
      content_fingerprint: preview.content_fingerprint,
      token: page.impact_confirmation_token
    };
    return true;
  };

  const supersede = () => {
    generation += 1;
    pending.clear();
    invalidateConfirmations();
  };

  function runTracked<T, TResult extends V3RequestResult<T>>(
    command: V3RequestCommand,
    request: () => Promise<T>,
    accept: (value: T, accepted: boolean) => TResult
  ): Promise<TResult> {
    const inFlight = pending.get(command);
    if (inFlight) return inFlight as Promise<TResult>;

    if (command === "impact") invalidateConfirmations();

    const requestGeneration = ++generation;
    let requestPromise: Promise<T>;
    try {
      requestPromise = request();
    } catch (error) {
      requestPromise = Promise.reject(error);
    }

    const tracked = requestPromise.then(
      (value) => accept(value, !disposed && generation === requestGeneration),
      (error: unknown) => {
        if (
          !disposed &&
          generation === requestGeneration &&
          invalidatesV3Confirmations(classifyV3Problem(error, command))
        ) {
          invalidateConfirmations();
        }
        throw error;
      }
    );
    pending.set(command, tracked as Promise<V3RequestResult<unknown>>);
    void tracked.then(
      () => {
        if (pending.get(command) === tracked) pending.delete(command);
      },
      () => {
        if (pending.get(command) === tracked) pending.delete(command);
      }
    );
    return tracked;
  }

  return {
    canonical: () => canonicalWord,
    isPending: (command) => pending.has(command),
    runRequest: (command, request) =>
      runTracked(command, request, (value, accepted) => ({ accepted, value })),
    runCanonical(command, request) {
      return runTracked(command, request, (value, isCurrent) => {
        const accepted = isCurrent && value.word.id === canonicalWord.id;
        if (accepted) {
          canonicalWord = value.word;
          invalidateConfirmations();
        }
        return { accepted, value };
      });
    },
    bindSurfaceConfirmation(page, content) {
      impactPreviewBinding = undefined;
      impactBinding = undefined;
      return bindSurfacePage(page, exactContentBinding(content));
    },
    bindImpactConfirmation(impact, content) {
      invalidateConfirmations();
      if (impact.base_revision !== canonicalWord.revision) return false;
      const exactContent = exactContentBinding(content);
      const surfacePage = impact.surface_match_page;
      if (surfacePage) {
        impactPreviewBinding = {
          ...exactContent,
          requires_confirmation: impact.requires_confirmation,
          snapshot_id: surfacePage.snapshot_id,
          policy_name: surfacePage.policy_name,
          policy_epoch: surfacePage.policy_epoch
        };
        return bindImpactSurfacePage(surfacePage);
      }
      if (!impact.requires_confirmation || !impact.confirmation_token) {
        return false;
      }
      impactBinding = {
        ...exactContent,
        token: impact.confirmation_token
      };
      return true;
    },
    bindImpactSurfaceConfirmation(page) {
      return bindImpactSurfacePage(page);
    },
    confirmations(context) {
      const result: V3ConfirmationTokens = {};
      if (
        impactBinding?.base_revision === canonicalWord.revision &&
        context?.base_revision === canonicalWord.revision &&
        context.impact_content !== undefined &&
        impactBinding.content_digest ===
          formsContentDigest(context.impact_content) &&
        impactBinding.content_fingerprint ===
          formsContentFingerprint(context.impact_content)
      ) {
        result.confirmed_impact_token = impactBinding.token;
      }
      if (
        context &&
        surfaceBinding &&
        surfaceBinding.base_revision === canonicalWord.revision &&
        context.base_revision === surfaceBinding.base_revision &&
        context.impact_content !== undefined &&
        surfaceBinding.content_digest ===
          formsContentDigest(context.impact_content) &&
        surfaceBinding.content_fingerprint ===
          formsContentFingerprint(context.impact_content) &&
        context.snapshot_id === surfaceBinding.snapshot_id &&
        context.policy_name === surfaceBinding.policy_name &&
        context.policy_epoch === surfaceBinding.policy_epoch
      ) {
        result.confirmed_surface_match_token = surfaceBinding.token;
      }
      return result;
    },
    supersede,
    dispose() {
      disposed = true;
      supersede();
    }
  };
}
