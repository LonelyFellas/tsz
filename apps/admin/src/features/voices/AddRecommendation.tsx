import { speechAccentGroup } from "@tsz/shared";
import { useQuery } from "@tanstack/react-query";
import type { AdminSpeechVoice, AdminVoiceParameters } from "@tsz/types";
import { Alert, Button, Form, Select, Space } from "antd";
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
  const [error, setError] = useState("");
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
      setError("请选择推荐分组。");
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
      setError("该组已有 20 个推荐，请先在分组配音中整理。");
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
      setError("请先修正当前试听参数，输入已保留。");
    } finally {
      setPending(false);
    }
  }
  if (done)
    return (
      <Alert
        type="success"
        showIcon
        title="已应用到分组草稿，请回到该组点击“完成”后保存。"
        action={<Button onClick={onClose}>完成</Button>}
      />
    );
  return (
    <div>
      {groups.isError && (
        <Alert
          type="error"
          title="分组加载失败。"
          action={<Button onClick={() => void groups.refetch()}>重试</Button>}
        />
      )}
      <Form component="div" layout="vertical">
        <Form.Item label="推荐分组">
          <Select
            aria-label="推荐分组"
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
            创建整套推荐
          </Button>
          <Button disabled={pending} onClick={onClose}>
            取消添加
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
