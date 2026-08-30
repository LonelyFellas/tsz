import {
  decodeAdminWordDraftAnyEnvelope,
  InvalidAdminWordResponseError,
  UnsupportedAdminWordSchemaVersionError,
  type AdminEndpoints
} from "@tsz/api-client";
import type {
  AdminWordAnyEnvelope,
  AdminWordDraftV3Envelope,
  AdminWordPublicationAny,
  AdminWordV3Envelope
} from "@tsz/types";
import { api } from "@/lib/auth";

export type V3WordsApi = Pick<
  AdminEndpoints["words"],
  | "detectV3"
  | "surfaceMatchSnapshotPageV3"
  | "createV3"
  | "getAny"
  | "previewFormsImpactV3"
  | "saveFormsStepV3"
  | "saveMeaningsStepV3"
  | "replaceSentenceAssociations"
  | "resolveSentenceTargetsV3"
  | "listPendingSentenceAssociations"
  | "claimPendingSentenceAssociation"
  | "validateV3"
  | "publishV3"
  | "listPublications"
  | "getPublication"
  | "activatePublicationV3"
>;

function requireV3Draft(
  envelope: Awaited<ReturnType<V3WordsApi["getAny"]>>
): AdminWordDraftV3Envelope {
  if (envelope.word.schema_version !== 3) {
    throw new UnsupportedAdminWordSchemaVersionError(
      envelope.word.schema_version,
      "word.schema_version",
      [3]
    );
  }
  return decodeAdminWordDraftAnyEnvelope(envelope) as AdminWordDraftV3Envelope;
}

function requireIdentity(
  actual: string | number,
  expected: string | number,
  responsePath: string
): void {
  if (actual !== expected) {
    throw new InvalidAdminWordResponseError(
      responsePath,
      "enum_mismatch",
      typeof actual === "number" ? "number" : "string"
    );
  }
}

function requireWordIdentity<T extends { word: { id: string } }>(
  envelope: T,
  wordId: string,
  responsePath: string
): T {
  requireIdentity(envelope.word.id, wordId, responsePath);
  return envelope;
}

function requireV3Envelope(
  envelope: AdminWordAnyEnvelope,
  responsePath: string
): AdminWordV3Envelope {
  if (envelope.word.schema_version !== 3) {
    throw new UnsupportedAdminWordSchemaVersionError(
      envelope.word.schema_version,
      responsePath,
      [3]
    );
  }
  return envelope as AdminWordV3Envelope;
}

function requirePublicationIdentity(
  publication: AdminWordPublicationAny,
  wordId: string,
  responsePath: string
): void {
  requireIdentity(publication.entry_id, wordId, `${responsePath}.entry_id`);
  requireIdentity(publication.word.id, wordId, `${responsePath}.word.id`);
}

/**
 * V3 creation request boundary. It forwards the canonical snake_case DTOs to
 * the generated API client, narrows the shared V2/V3 detail endpoint, and
 * rejects response identities that do not match the requested path.
 */
export function createV3WordRequests(source: V3WordsApi = api.words) {
  return {
    detect: (input: Parameters<V3WordsApi["detectV3"]>[0]) =>
      source.detectV3(input).then((response) => {
        requireIdentity(
          response.request.language,
          input.language,
          "detect.request.language"
        );
        requireIdentity(
          response.request.kind,
          input.kind,
          "detect.request.kind"
        );
        requireIdentity(
          response.request.surface,
          input.surface,
          "detect.request.surface"
        );
        return response;
      }),
    surfacePage: (snapshotId: string, cursor: string, signal?: AbortSignal) =>
      source
        .surfaceMatchSnapshotPageV3(snapshotId, cursor, signal)
        .then((response) => {
          requireIdentity(
            response.snapshot_id,
            snapshotId,
            "surface_page.snapshot_id"
          );
          return response;
        }),
    create: source.createV3,
    get: (wordId: string) =>
      source
        .getAny(wordId)
        .then(requireV3Draft)
        .then((response) =>
          requireWordIdentity(response, wordId, "get.word.id")
        ),
    impact: (
      wordId: string,
      input: Parameters<V3WordsApi["previewFormsImpactV3"]>[1]
    ) =>
      source.previewFormsImpactV3(wordId, input).then((response) => {
        requireIdentity(
          response.base_revision,
          input.base_revision,
          "impact.base_revision"
        );
        return response;
      }),
    saveForms: (
      wordId: string,
      input: Parameters<V3WordsApi["saveFormsStepV3"]>[1]
    ) =>
      source
        .saveFormsStepV3(wordId, input)
        .then((response) =>
          requireWordIdentity(response, wordId, "save_forms.word.id")
        ),
    saveMeanings: (
      wordId: string,
      input: Parameters<V3WordsApi["saveMeaningsStepV3"]>[1]
    ) =>
      source
        .saveMeaningsStepV3(wordId, input)
        .then((response) =>
          requireWordIdentity(response, wordId, "save_meanings.word.id")
        ),
    replaceSentenceAssociations: (
      wordId: string,
      sentenceId: string,
      idempotencyKey: string,
      input: Parameters<V3WordsApi["replaceSentenceAssociations"]>[3]
    ) =>
      source
        .replaceSentenceAssociations(wordId, sentenceId, idempotencyKey, input)
        .then((response) =>
          requireWordIdentity(
            response,
            wordId,
            "replace_sentence_associations.word.id"
          )
        )
        .then((response) =>
          requireV3Envelope(
            response,
            "replace_sentence_associations.word.schema_version"
          )
        ),
    resolveSentenceTargets: (
      input: Parameters<V3WordsApi["resolveSentenceTargetsV3"]>[0],
      signal?: AbortSignal
    ) => source.resolveSentenceTargetsV3(input, signal),
    listPendingSentenceAssociations: (
      targetWordId: string,
      query?: Parameters<V3WordsApi["listPendingSentenceAssociations"]>[1]
    ) => source.listPendingSentenceAssociations(targetWordId, query),
    claimPendingSentenceAssociation: (
      ownerWordId: string,
      associationId: string,
      idempotencyKey: string,
      input: Parameters<V3WordsApi["claimPendingSentenceAssociation"]>[2]
    ) =>
      source
        .claimPendingSentenceAssociation(associationId, idempotencyKey, input)
        .then((response) =>
          requireWordIdentity(
            response,
            ownerWordId,
            "claim_pending_sentence_association.word.id"
          )
        )
        .then((response) =>
          requireV3Envelope(
            response,
            "claim_pending_sentence_association.word.schema_version"
          )
        ),
    validate: (
      wordId: string,
      input: Parameters<V3WordsApi["validateV3"]>[1]
    ) =>
      source.validateV3(wordId, input).then((response) => {
        requireIdentity(
          response.validated_revision,
          input.base_revision,
          "validate.validated_revision"
        );
        return response;
      }),
    publish: (
      wordId: string,
      idempotencyKey: string,
      input: Parameters<V3WordsApi["publishV3"]>[2]
    ) =>
      source
        .publishV3(wordId, idempotencyKey, input)
        .then((response) =>
          requireWordIdentity(response, wordId, "publish.word.id")
        ),
    listPublications: (wordId: string) =>
      source.listPublications(wordId).then((response) => {
        response.publications.forEach((publication, index) =>
          requirePublicationIdentity(
            publication,
            wordId,
            `publications[${index}]`
          )
        );
        return response;
      }),
    getPublication: (wordId: string, publicationId: string) =>
      source.getPublication(wordId, publicationId).then((response) => {
        requirePublicationIdentity(response.publication, wordId, "publication");
        requireIdentity(
          response.publication.publication_id,
          publicationId,
          "publication.publication_id"
        );
        return response;
      }),
    activatePublication: (
      wordId: string,
      publicationId: string,
      idempotencyKey: string,
      input: Parameters<V3WordsApi["activatePublicationV3"]>[3]
    ) =>
      source
        .activatePublicationV3(wordId, publicationId, idempotencyKey, input)
        .then((response) =>
          requireWordIdentity(response, wordId, "activate_publication.word.id")
        )
  };
}

export type V3WordRequests = ReturnType<typeof createV3WordRequests>;
