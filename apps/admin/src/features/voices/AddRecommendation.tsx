import {
  useVoiceTranslation,
  voiceMessage,
  useVoiceMessageState
} from "./i18n";
import { speechAccentGroup } from "@tsz/shared";
import { useQuery } from "@tanstack/react-query";
import type { AdminSpeechVoice, AdminVoiceParameters } from "@tsz/types";
import { Alert, Button, Space } from "@tsz/ui/admin/display";
import { Form, Select } from "@tsz/ui/admin/forms";
import { useEffect, useState } from "react";
import { api, useAuthStore, usePermission } from "@/lib/auth";
import { useDubbingDrafts } from "./DubbingDrafts";
import {
  dubbingGroupsKey,
  newPairVoice,
  type DubbingDraft
} from "./dubbing-model";
import {
  RecommendationEditor,
  type RecommendationSeed
} from "./RecommendationEditor";

export function AddRecommendation({
  voice,
  voices,
  readParameters,
  onBusyChange,
  onClose
}: {
  voice: AdminSpeechVoice;
  voices: AdminSpeechVoice[];
  readParameters: () => Promise<AdminVoiceParameters>;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { t } = useVoiceTranslation();
  const accountId = useAuthStore((state) => state.profile?.id);
  const canEdit = usePermission("speech.global_dubbing");
  const [drafts, setDrafts] = useDubbingDrafts();
  const groups = useQuery({
    queryKey: dubbingGroupsKey(accountId),
    queryFn: ({ signal }) => api.speech.groupsV3(signal),
    retry: false
  });
  const [groupId, setGroupId] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useVoiceMessageState("");
  const [seed, setSeed] = useState<RecommendationSeed>();
  const [done, setDone] = useState(false);
  useEffect(() => {
    onBusyChange(pending || !!seed);
    return () => onBusyChange(false);
  }, [pending, seed, onBusyChange]);
  const locale = speechAccentGroup(voice.locale, voice.accent);
  const options: DubbingDraft[] = [
    ...(groups.data?.groups.map((group) => drafts[group.id] ?? group) ?? []),
    ...Object.values(drafts).filter(
      (draft) => !groups.data?.groups.some((group) => group.id === draft.id)
    )
  ];
  async function add() {
    if (
      !canEdit ||
      pending ||
      done ||
      !groups.data ||
      (locale !== "uk" && locale !== "us")
    )
      return;
    const group = options.find((g) => g.id === groupId);
    if (!group) {
      setError(voiceMessage("select_a_recommendation_group"));
      return;
    }
    const rec = group.recommendations;
    if (
      (rec.format === "paired"
        ? rec.pairs.length
        : Math.max(
            rec.uk.length,
            rec.us.length,
            group.legacyPairs?.length ?? 0
          )) >= 20
    ) {
      setError(
        voiceMessage(
          "this_group_already_has_20_recommendations_organise_them_in_group_"
        )
      );
      return;
    }
    setPending(true);
    setError("");
    try {
      const parameters = await readParameters();
      if (useAuthStore.getState().profile?.id !== accountId) return;
      setSeed({
        name: voice.display_name,
        [locale]: { ...newPairVoice(voice), parameters }
      });
    } catch {
      setError(
        voiceMessage(
          "correct_the_preview_parameters_first_your_input_has_been_kept"
        )
      );
    } finally {
      setPending(false);
    }
  }
  if (done)
    return (
      <Alert
        type="success"
        showIcon
        title={t(
          "applied_to_the_group_draft_return_to_the_workspace_and_save_the_g"
        )}
        action={<Button onClick={onClose}>{t("done")}</Button>}
      />
    );
  return (
    <div>
      {groups.isError && (
        <Alert
          type="error"
          title={t("could_not_load_groups")}
          action={
            <Button onClick={() => void groups.refetch()}>
              {t("try_again")}
            </Button>
          }
        />
      )}
      <Form component="div" layout="vertical">
        <Form.Item label={t("recommendation_group")}>
          <Select
            aria-label={t("recommendation_group")}
            value={groupId}
            loading={groups.isPending}
            options={options.map((group) => ({
              value: group.id,
              label: group.name
            }))}
            disabled={pending || !!seed || !canEdit}
            onChange={setGroupId}
          />
        </Form.Item>
        <Space>
          <Button
            type="primary"
            disabled={
              !canEdit ||
              !groups.isSuccess ||
              !options.length ||
              (locale !== "uk" && locale !== "us")
            }
            loading={pending}
            onClick={() => void add()}
          >
            {t("create_recommendation_pair")}
          </Button>
          <Button disabled={pending} onClick={onClose}>
            {t("cancel_addition")}
          </Button>
        </Space>
      </Form>
      {error && <Alert type="error" title={error} />}
      {seed && (
        <RecommendationEditor
          voices={voices}
          initial={seed}
          disabled={!canEdit || pending}
          onCancel={() => setSeed(undefined)}
          onSave={(pair) => {
            if (!canEdit || useAuthStore.getState().profile?.id !== accountId)
              return;
            const original = options.find((g) => g.id === groupId);
            if (!original) return;
            setDrafts((current) => {
              const target = current[original.id] ?? original;
              const rec = target.recommendations;
              return {
                ...current,
                [target.id]:
                  rec.format === "paired"
                    ? {
                        ...target,
                        recommendations: {
                          format: "paired",
                          pairs: [...rec.pairs, pair]
                        }
                      }
                    : {
                        ...target,
                        legacyPairs: [...(target.legacyPairs ?? []), pair]
                      }
              };
            });
            setSeed(undefined);
            setDone(true);
          }}
        />
      )}
    </div>
  );
}
