import {
  useLexiconEditorTranslation,
  defaultLexiconEditorTranslation,
  type LexiconEditorTranslation,
  useLexiconEditorMessageState,
  createLexiconEditorMessage
} from "./i18n/editor";
import {
  Alert,
  Button,
  Card,
  List,
  Space,
  Tag,
  Typography
} from "@tsz/ui/admin/display";
import { Volume2Icon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  PublicationAudioIssue,
  PublicationAudioRequirement,
  PublicationAudioReview
} from "@tsz/types";
import { api } from "@/lib/auth";
import { HttpError } from "@tsz/api-client";
import {
  usePublicationAudioPlayback,
  type PublicationAudioResolver
} from "./usePublicationAudioPlayback";

type Requests = typeof api.words.publicationAudio;
interface Props {
  owner: "entry" | "sentence";
  id: string;
  revision: number;
  canConfirm: boolean;
  content?: unknown;
  onReady: (ready: boolean) => void;
  requests?: Requests;
  resolveAudio?: PublicationAudioResolver;
}

export function audioIssueLabels(
  t: LexiconEditorTranslation = defaultLexiconEditorTranslation
): Record<PublicationAudioIssue, string> {
  return {
    missing_configuration: t("panel_no_pronunciation_configuration_selected"),
    missing_asset: t(
      "panel_final_audio_has_not_been_generated_for_the_selected_voice"
    ),
    invalid_source: t(
      "panel_the_reading_or_voice_configuration_is_unavailable"
    ),
    asset_unavailable: t(
      "panel_audio_is_unavailable_or_has_not_been_saved_to_the_current_content"
    ),
    effect_mismatch: t(
      "panel_audio_does_not_match_the_current_reading_or_voice_configuration"
    ),
    object_unavailable: t("panel_the_audio_file_cannot_currently_be_read")
  };
}
function audioAccentLabels(
  t: LexiconEditorTranslation = defaultLexiconEditorTranslation
) {
  return {
    uk: t("panel_british"),
    us: t("panel_american"),
    other: t("panel_other")
  };
}

export function PublicationAudioReviewPanel(props: Props) {
  return (
    <ReviewPanel
      key={`${props.owner}:${props.id}:${props.revision}`}
      {...props}
    />
  );
}

function ReviewPanel({
  owner,
  id,
  revision,
  canConfirm,
  content,
  onReady,
  requests,
  resolveAudio
}: Props) {
  const { t } = useLexiconEditorTranslation();
  const endpoint =
    requests ??
    (owner === "entry"
      ? api.words.publicationAudio
      : api.sentences.publicationAudio);
  const [review, setReview] = useState<PublicationAudioReview>();
  const [busy, setBusy] = useState(false);
  const [legacyService, setLegacyService] = useState(false);
  const [error, setError] = useLexiconEditorMessageState();
  const request = useRef<AbortController | null>(null);
  const readyCallback = useRef(onReady);
  readyCallback.current = onReady;

  const seenAssets = new Set<string>();
  const items = (review?.manifest.items ?? []).filter((item) => {
    if (item.issue || !item.asset_id) return true;
    if (seenAssets.has(item.asset_id)) return false;
    seenAssets.add(item.asset_id);
    return true;
  });
  const playback = usePublicationAudioPlayback(
    items,
    (message) => {
      readyCallback.current(false);
      setError(message);
    },
    resolveAudio
  );
  const { stop, playing } = playback;

  const load = useCallback(async () => {
    request.current?.abort();
    stop();
    const controller = new AbortController();
    request.current = controller;
    readyCallback.current(false);
    setBusy(true);
    setLegacyService(false);
    setReview(undefined);
    setError(undefined);
    try {
      const result = await endpoint.check(
        id,
        { base_revision: revision },
        controller.signal
      );
      if (controller.signal.aborted) return;
      if (
        result.manifest.revision !== revision ||
        (owner === "entry"
          ? !("entry" in result.manifest.owner) ||
            result.manifest.owner.entry !== id
          : !("sentence" in result.manifest.owner) ||
            result.manifest.owner.sentence !== id)
      ) {
        setError(
          createLexiconEditorMessage(
            "panel_the_audio_manifest_does_not_match_the_current_content_check_again"
          )
        );
        return;
      }
      setReview(result);
      readyCallback.current(
        result.manifest.ready &&
          (result.confirmed || result.manifest.items.length === 0)
      );
    } catch (failure) {
      // Frontend-first rollout: an older API has no review endpoint. Its final
      // publication endpoint remains authoritative; a new API always enforces receipts.
      if (
        !controller.signal.aborted &&
        failure instanceof HttpError &&
        failure.status === 404
      ) {
        setLegacyService(true);
        readyCallback.current(true);
        return;
      }
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : createLexiconEditorMessage("panel_audio_check_failed_try_again")
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }, [endpoint, id, revision, owner, stop, setError]);

  useEffect(() => {
    void load();
    return () => {
      request.current?.abort();
      stop();
    };
  }, [load, stop]);

  async function confirm() {
    if (!canConfirm || busy || !review?.manifest.ready) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    readyCallback.current(false);
    setBusy(true);
    setError(undefined);
    try {
      const result = await endpoint.confirm(
        id,
        {
          base_revision: revision,
          manifest_hash: review.manifest.manifest_hash
        },
        controller.signal
      );
      if (controller.signal.aborted) return;
      if (
        result.manifest.revision !== revision ||
        result.manifest.manifest_hash !== review.manifest.manifest_hash ||
        !result.confirmed ||
        !result.manifest.ready ||
        !result.receipt_id ||
        (owner === "entry"
          ? !("entry" in result.manifest.owner) ||
            result.manifest.owner.entry !== id
          : !("sentence" in result.manifest.owner) ||
            result.manifest.owner.sentence !== id)
      ) {
        throw new Error(
          t("panel_the_audio_manifest_changed_check_and_review_it_again")
        );
      }
      setReview(result);
      readyCallback.current(true);
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : createLexiconEditorMessage(
                "panel_audio_confirmation_failed_try_again"
              )
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const audition = (indices: number[]) => {
    setError(undefined);
    return playback.audition(indices);
  };

  const ready =
    review?.manifest.ready && (review.confirmed || items.length === 0);
  return (
    <Card size="small" title={t("panel_publication_audio")}>
      <Space orientation="vertical" style={{ width: "100%" }}>
        <Typography.Text type="secondary">
          {t(
            "panel_review_the_current_final_audio_then_confirm_this_batch_check_again_after_ch"
          )}
        </Typography.Text>
        {error && <Alert type="error" showIcon title={error} />}
        {legacyService && (
          <Alert
            type="info"
            showIcon
            title={t(
              "panel_this_service_version_does_not_support_audio_confirmation_yet"
            )}
            description={t(
              "panel_this_transitional_version_continues_server_side_publication_checks_check_an"
            )}
          />
        )}
        {review && !review.manifest.ready && (
          <Alert
            type="warning"
            showIcon
            title={t("panel_audio_still_needs_completing")}
            description={t(
              "panel_return_to_the_relevant_content_select_readings_and_voices_generate_and_save"
            )}
          />
        )}
        {ready && (
          <Tag color="success">
            {items.length
              ? t("panel_audio_batch_confirmed")
              : t("panel_no_voice_versions_need_confirmation")}
          </Tag>
        )}
        <List
          size="small"
          dataSource={items}
          renderItem={(item, index) => (
            <List.Item
              key={`${item.target_id}:${item.source_path}:${item.setting ? `voice:${item.setting.version_id ?? item.setting.voice_id}` : (item.asset_id ?? `default:${item.default_for.join(",")}`)}`}
              actions={[
                <Button
                  key="play"
                  icon={<Volume2Icon />}
                  aria-label={t("panel_audition_final_audio", {
                    p0: index + 1
                  })}
                  disabled={busy || !!item.issue || !item.asset_id}
                  loading={playing === index}
                  onClick={() => void audition([index])}
                >
                  {t("panel_audition")}
                </Button>
              ]}
            >
              <Space
                orientation="vertical"
                size={0}
                style={{ minWidth: 0, flex: 1, wordBreak: "break-word" }}
              >
                <Typography.Text>
                  {publicationAudioText(content, item) ||
                    t("panel_audio_2", { p0: index + 1 })}{" "}
                  {item.setting?.version_name ?? item.setting?.voice_id ?? ""}
                </Typography.Text>
                <Typography.Text type={item.issue ? "warning" : "secondary"}>
                  {item.default_for
                    .map((a) => audioAccentLabels(t)[a])
                    .join(" / ") ||
                    (item.setting?.locale === "en-GB"
                      ? t("panel_british")
                      : item.setting?.locale === "en-US"
                        ? t("panel_american")
                        : t("panel_selected_final_audio"))}
                  {item.issue ? ` · ${audioIssueLabels(t)[item.issue]}` : ""}
                </Typography.Text>
              </Space>
            </List.Item>
          )}
        />
        <Space wrap>
          <Button
            aria-label={t("panel_check_audio_again")}
            loading={busy}
            onClick={() => void load()}
          >
            {t("panel_check_audio_again")}
          </Button>
          <Button
            disabled={
              busy || !items.some((item) => item.asset_id && !item.issue)
            }
            onClick={() => void audition(items.map((_, index) => index))}
          >
            {t("panel_audition_all")}
          </Button>
          {playing !== undefined && (
            <Button onClick={stop}>{t("panel_stop_audition")}</Button>
          )}
          {canConfirm && !ready && (
            <Button
              type="primary"
              disabled={busy || !!error || !review?.manifest.ready}
              onClick={() => void confirm()}
            >
              {t("panel_confirm_audio_batch")}
            </Button>
          )}
        </Space>
      </Space>
    </Card>
  );
}

// Match business IDs so shared bindings and reordered arrays keep the same label.
export function publicationAudioText(
  content: unknown,
  item: PublicationAudioRequirement
): string | undefined {
  if (item.source?.content.text) return item.source.content.text;
  function find(value: unknown, spelling?: string): string | undefined {
    if (!value || typeof value !== "object") return undefined;
    if (Array.isArray(value)) {
      for (const child of value) {
        const found = find(child, spelling);
        if (found) return found;
      }
      return undefined;
    }
    const row = value as Record<string, unknown>;
    const text = typeof row.spelling === "string" ? row.spelling : spelling;
    if (row.id === item.target_id && text) return text;
    for (const [key, child] of Object.entries(row)) {
      if (key === "regional_bindings" || key === "pronunciation_slots")
        continue;
      const found = find(child, text);
      if (found) return found;
    }
    return undefined;
  }
  return find(content);
}
