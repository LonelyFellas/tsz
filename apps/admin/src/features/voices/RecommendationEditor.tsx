import { useLayoutEffect, useRef, useState } from "react";
import { speechAccentGroup } from "@tsz/shared";
import type {
  AdminDubbingRecommendationPair,
  AdminSpeechVoice,
  AdminDubbingRecommendation,
  AdminVoiceParameters
} from "@tsz/types";
import {
  Alert,
  Button,
  Flex,
  Empty,
  Space,
  Typography
} from "@tsz/ui/admin/display";
import {
  Checkbox,
  Form,
  Input,
  Radio,
  Select,
  Segmented
} from "@tsz/ui/admin/forms";
import { Drawer } from "@tsz/ui/admin/overlays";
import { newWordNodeId } from "@/features/dictionary/word-model/primitives";
import {
  newPairVoice,
  recommendationError,
  sides,
  sideName,
  type DubbingSide
} from "./dubbing-model";
import { VoiceName } from "./VoiceDisplay";
import { DubbingAudition, DEFAULT_DUBBING_TRIAL_TEXT } from "./DubbingAudition";
import { VoiceConfigurationPanel } from "./VoiceConfigurationPanel";
import { newVoiceTrial, type VoiceTrialSource } from "./voice-trial";
import type { SsmlDraft } from "@tsz/voice-editor/types";
import {
  VoiceParameterFields,
  defaultVoiceParameters,
  type VoiceParameterValues
} from "./VoiceParameterFields";

export type RecommendationSeed = Partial<
  Pick<AdminDubbingRecommendationPair, "uk" | "us">
> & { id?: string; name?: string; selected?: boolean };
type ParameterFormValues = {
  [Key in keyof VoiceParameterValues]: VoiceParameterValues[Key] | null;
};

export function RecommendationEditor({
  voices,
  initial,
  side,
  legacy,
  disabled,
  onBeforeAudition,
  onSave,
  onCancel
}: {
  voices: AdminSpeechVoice[];
  initial: RecommendationSeed;
  side?: DubbingSide;
  legacy?: {
    uk: AdminDubbingRecommendation[];
    us: AdminDubbingRecommendation[];
  };
  disabled: boolean;
  onBeforeAudition?: () => void;
  onSave: (pair: AdminDubbingRecommendationPair) => void;
  onCancel: () => void;
}) {
  const [parameterForm] = Form.useForm<ParameterFormValues>();
  const controlsPanel = useRef<HTMLElement>(null);
  const [value, setValue] = useState<RecommendationSeed>(() =>
    structuredClone(initial)
  );
  const [trialSources, setTrialSources] = useState<
    Record<string, VoiceTrialSource>
  >({});
  const [ssmlDrafts, setSsmlDrafts] = useState<Record<string, SsmlDraft>>({});
  const voiceDrafts = useRef(new Map<string, AdminVoiceParameters>());
  const [search, setSearch] = useState("");
  const [gender, setGender] = useState("all");
  const catalog = useRef<HTMLDivElement>(null);
  const [activeSide, setActiveSide] = useState<DubbingSide>(
    side ?? (initial.uk && !initial.us ? "us" : "uk")
  );
  const [error, setError] = useState<string>();
  useLayoutEffect(() => {
    if (catalog.current) catalog.current.scrollTop = 0;
  }, [activeSide, search, gender]);
  const candidates = voices
    .filter(
      (voice) => speechAccentGroup(voice.locale, voice.accent) === activeSide
    )
    .filter(
      (voice) => gender === "all" || voice.gender.toLowerCase() === gender
    )
    .filter((voice) =>
      `${voice.display_name} ${voice.metadata?.provider_voice_id ?? voice.alias}`
        .toLowerCase()
        .includes(search.trim().toLowerCase())
    )
    .sort((a, b) => Number(b.is_common) - Number(a.is_common));
  function chooseVoice(chosen: AdminSpeechVoice) {
    const current = value[activeSide];
    if (current?.voice_alias === chosen.alias) return;
    // 原有声音组合以原条目身份为准；普通编辑在本次抽屉内暂存每个候选声音。
    if (!legacy && current)
      voiceDrafts.current.set(
        `${activeSide}:${current.voice_alias}`,
        structuredClone(current.parameters)
      );
    const next = newPairVoice(chosen);
    const saved =
      !legacy && voiceDrafts.current.get(`${activeSide}:${chosen.alias}`);
    if (saved) next.parameters = structuredClone(saved);
    if (current) next.id = current.id;
    setValue((previous) => ({ ...previous, [activeSide]: next }));
    setError(undefined);
  }
  const item = value[activeSide];
  const voice = voices.find((v) => v.alias === item?.voice_alias);
  function parameters(update: Partial<NonNullable<typeof item>["parameters"]>) {
    setError(undefined);
    setValue((v) =>
      v[activeSide]
        ? {
            ...v,
            [activeSide]: {
              ...v[activeSide],
              parameters: { ...v[activeSide]!.parameters, ...update }
            }
          }
        : v
    );
  }
  function save() {
    if (disabled) return;
    if (!value.name?.trim()) {
      setError("请填写推荐名称。");
      return;
    }
    if (Array.from(value.name.trim()).length > 40) {
      setError("推荐名称最多 40 字。");
      return;
    }
    for (const key of sides) {
      const next = value[key];
      if (!next) {
        setActiveSide(key);
        setSearch("");
        setError(`请明确选择${sideName(key)}音色，每套必须包含英美各一项。`);
        return;
      }
      if (!side || side === key) {
        const issue = recommendationError(
          "推荐",
          key,
          { ...next, name: value.name },
          voices.find((v) => v.alias === next.voice_alias)
        );
        if (issue) {
          setActiveSide(key);
          setError(issue);
          return;
        }
      }
    }
    onSave({
      id: value.id ?? newWordNodeId(),
      name: value.name.trim(),
      selected: value.selected ?? !legacy,
      uk: value.uk!,
      us: value.us!
    });
  }
  // 只在切换声音或口音时回填，避免逐字输入时重设表单打断编辑。
  const parameterSource = useRef(item);
  parameterSource.current = item;
  useLayoutEffect(() => {
    if (!parameterSource.current) return;
    const fields = parameterSource.current.parameters;
    parameterForm.setFieldsValue({
      rate_percent: Number.isFinite(fields.rate_percent)
        ? fields.rate_percent
        : null,
      pitch_semitones: Number.isFinite(fields.pitch_semitones)
        ? fields.pitch_semitones
        : null,
      volume_percent:
        fields.volume_percent === undefined
          ? 100
          : Number.isFinite(fields.volume_percent)
            ? fields.volume_percent
            : null,
      style: fields.style ?? "",
      style_degree:
        fields.style_degree == null
          ? undefined
          : Number.isFinite(fields.style_degree)
            ? fields.style_degree
            : null,
      role: fields.role ?? ""
    });
  }, [parameterForm, activeSide, item?.id, item?.voice_alias]);
  useLayoutEffect(() => {
    if (controlsPanel.current) controlsPanel.current.scrollTop = 0;
  }, [activeSide, item?.voice_alias, item?.id]);
  const defaults = voice ? defaultVoiceParameters(voice) : undefined;
  const parametersAreDefault =
    !!item &&
    !!defaults &&
    item.parameters.rate_percent === defaults.rate_percent &&
    item.parameters.pitch_semitones === defaults.pitch_semitones &&
    (item.parameters.volume_percent ?? 100) === defaults.volume_percent &&
    !item.parameters.style &&
    item.parameters.style_degree == null &&
    item.parameters.role == null;
  const controls =
    voice && item ? (
      <VoiceConfigurationPanel
        parameters={
          <>
            <VoiceParameterFields
              voice={voice}
              disabled={disabled}
              volume={item.parameters.volume_percent ?? 100}
              style={item.parameters.style}
              resetDisabled={parametersAreDefault}
              onReset={() => {
                parameterForm.setFieldsValue(defaultVoiceParameters(voice));
                parameters({
                  ...defaultVoiceParameters(voice),
                  style: null,
                  style_degree: undefined,
                  role: undefined
                });
              }}
            />
            {side && error && <Alert type="error" showIcon title={error} />}
          </>
        }
        audition={
          <DubbingAudition
            key={activeSide}
            voice={voice}
            parameters={item.parameters}
            originalVoice={voices.find(
              (candidate) =>
                candidate.alias === initial[activeSide]?.voice_alias
            )}
            originalParameters={initial[activeSide]?.parameters}
            side={activeSide}
            disabled={disabled}
            source={
              trialSources[voice.alias] ??
              newVoiceTrial(DEFAULT_DUBBING_TRIAL_TEXT)
            }
            onSourceChange={(source) =>
              setTrialSources((current) => ({
                ...current,
                [voice.alias]: source
              }))
            }
            onBeforeAudition={onBeforeAudition}
            ssmlDraft={ssmlDrafts[voice.alias]}
            onSsmlDraftChange={(draft) =>
              setSsmlDrafts((current) => ({ ...current, [voice.alias]: draft }))
            }
          />
        }
      />
    ) : (
      <div className="dubbing-parameter-empty">
        <Typography.Title level={5}>
          {sideName(activeSide)}声音参数
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          先从目录选择声音，即可调节参数并试听。
        </Typography.Paragraph>
      </div>
    );
  const content = (
    <Form
      component="div"
      form={parameterForm}
      onValuesChange={(_, fields: ParameterFormValues) =>
        parameters({
          rate_percent: fields.rate_percent ?? Number.NaN,
          pitch_semitones: fields.pitch_semitones ?? Number.NaN,
          volume_percent: fields.volume_percent ?? Number.NaN,
          style: fields.style || null,
          style_degree:
            fields.style_degree === null ? Number.NaN : fields.style_degree,
          role: fields.role || undefined
        })
      }
      layout="vertical"
      requiredMark={false}
      disabled={disabled}
      className={
        side ? undefined : `dubbing-pair-form${legacy ? " is-legacy" : ""}`
      }
    >
      {side ? (
        <>
          <Form.Item label={`${sideName(side)}音色`}>
            <Select
              aria-label={`${sideName(side)}音色`}
              showSearch
              value={item?.voice_alias}
              options={voices
                .filter((v) => speechAccentGroup(v.locale, v.accent) === side)
                .map((v) => ({
                  value: v.alias,
                  label: v.display_name,
                  searchText: `${v.display_name} ${v.metadata?.provider_voice_id ?? v.alias}`,
                  disabled: v.synthesis_available === false
                }))}
              filterOption={(input, option) =>
                (option?.searchText ?? "")
                  .toLowerCase()
                  .includes(input.trim().toLowerCase())
              }
              onChange={(alias) => {
                const chosen = voices.find((v) => v.alias === alias);
                if (chosen) chooseVoice(chosen);
              }}
            />
          </Form.Item>
          {controls}
        </>
      ) : (
        <>
          <div className="dubbing-pair-metadata">
            <Form.Item label="推荐名称" layout="horizontal" colon={false}>
              <Input
                aria-label="推荐名称"
                placeholder="例如：自然朗读、慢速跟读"
                maxLength={40}
                value={value.name ?? ""}
                onChange={(event) =>
                  setValue((current) => ({
                    ...current,
                    name: event.target.value
                  }))
                }
              />
            </Form.Item>
            <Checkbox
              checked={value.selected ?? !legacy}
              onChange={(event) =>
                setValue((current) => ({
                  ...current,
                  selected: event.target.checked
                }))
              }
            >
              选用整套推荐
            </Checkbox>
          </div>
          {legacy && (
            <Alert
              type="info"
              title="请选择要组成一套的原有声音，也可以补充缺少的一侧。现有声音设置会全部保留。"
            />
          )}
          {legacy && (
            <Flex gap={16} wrap>
              {sides.map((key) => (
                <Form.Item key={key} label={`${sideName(key)}原有声音`}>
                  <Select
                    aria-label={`选择${sideName(key)}原有声音`}
                    value={
                      legacy[key].some((i) => i.id === value[key]?.id)
                        ? value[key]?.id
                        : undefined
                    }
                    placeholder="选择现有声音，或在下方补充音色"
                    style={{ width: 300 }}
                    options={[
                      { value: "__new__", label: "补充音色（下方选择）" },
                      ...legacy[key].map((i) => ({
                        value: i.id,
                        label: `${i.name} · ${voices.find((v) => v.alias === i.voice_alias)?.display_name ?? i.voice_alias} · ${((i.parameters.rate_percent + 100) / 100).toFixed(2)}× / ${i.parameters.volume_percent ?? 100}%`
                      }))
                    ]}
                    onChange={(id) => {
                      if (id === "__new__") {
                        setValue((v) => ({ ...v, [key]: undefined }));
                        setActiveSide(key);
                        return;
                      }
                      const selected = legacy[key].find((i) => i.id === id)!;
                      setValue((v) => ({
                        ...v,
                        [key]: {
                          id: selected.id,
                          voice_alias: selected.voice_alias,
                          parameters: structuredClone(selected.parameters)
                        }
                      }));
                      setActiveSide(key);
                    }}
                  />
                </Form.Item>
              ))}
            </Flex>
          )}

          <div
            className="dubbing-pair-selection"
            role="group"
            aria-label="英美声音组合"
          >
            {sides.map((key) => {
              const selected = value[key];
              const chosen = voices.find(
                (voice) => voice.alias === selected?.voice_alias
              );
              const rate = selected?.parameters.rate_percent;
              const volume = selected?.parameters.volume_percent ?? 100;
              return (
                <Button
                  key={key}
                  className={`dubbing-selection-side${activeSide === key ? " is-active" : ""}`}
                  aria-label={`配置${sideName(key)}声音`}
                  aria-pressed={activeSide === key}
                  onClick={() => {
                    setActiveSide(key);
                    setSearch("");
                  }}
                >
                  <span className="dubbing-selection-label">
                    {sideName(key)}声音
                  </span>
                  <span className="dubbing-selection-name">
                    {chosen ? (
                      <VoiceName voice={chosen} />
                    ) : selected ? (
                      selected.voice_alias
                    ) : (
                      "待选音色"
                    )}
                  </span>
                  <span className="dubbing-selection-parameters">
                    {selected
                      ? `${Number.isFinite(rate) ? ((rate! + 100) / 100).toFixed(2) : "—"}× · ${Number.isFinite(volume) ? volume : "—"}%`
                      : "从目录选择"}
                  </span>
                </Button>
              );
            })}
          </div>
          <div className="dubbing-pair-workspace">
            <section
              className="dubbing-voice-picker"
              aria-label={`${sideName(activeSide)}音色目录`}
            >
              <div className="dubbing-picker-heading">
                <Typography.Title level={5}>
                  选择{sideName(activeSide)}声音
                </Typography.Title>
                <Typography.Text type="secondary">
                  {candidates.length} 个音色
                </Typography.Text>
              </div>
              <div className="dubbing-picker-filters">
                <Input.Search
                  aria-label="搜索推荐音色"
                  placeholder="搜索名称或官方 ID"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  allowClear
                />
                <Segmented
                  aria-label="音色性别"
                  value={gender}
                  onChange={setGender}
                  options={[
                    { value: "all", label: "全部" },
                    { value: "female", label: "女声" },
                    { value: "male", label: "男声" }
                  ]}
                />
              </div>
              <div
                className="dubbing-picker-list"
                ref={catalog}
                tabIndex={0}
                aria-label={`${sideName(activeSide)}音色滚动列表`}
              >
                {candidates.length ? (
                  candidates.map((candidate) => (
                    <div
                      key={candidate.alias}
                      className={`dubbing-picker-option${item?.voice_alias === candidate.alias ? " is-selected" : ""}`}
                    >
                      <Radio
                        checked={item?.voice_alias === candidate.alias}
                        disabled={
                          disabled || candidate.synthesis_available === false
                        }
                        onChange={() => chooseVoice(candidate)}
                      >
                        <VoiceName voice={candidate} />
                        <span className="dubbing-picker-badge" aria-hidden>
                          {candidate.synthesis_available === false
                            ? "暂不可用"
                            : candidate.is_common
                              ? "常用"
                              : ""}
                        </span>
                      </Radio>
                      <Typography.Text
                        className="dubbing-picker-id"
                        copyable={{
                          text:
                            candidate.metadata?.provider_voice_id ??
                            candidate.alias
                        }}
                      >
                        <span
                          title={
                            candidate.metadata?.provider_voice_id ??
                            candidate.alias
                          }
                        >
                          {candidate.metadata?.provider_voice_id ??
                            candidate.alias}
                        </span>
                      </Typography.Text>
                    </div>
                  ))
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="没有符合条件的音色，请调整搜索或筛选"
                  />
                )}
              </div>
            </section>
            <section
              className="dubbing-pair-controls-panel"
              ref={controlsPanel}
              aria-label={`${sideName(activeSide)}参数与试听`}
            >
              {controls}
            </section>
          </div>
        </>
      )}
    </Form>
  );

  const footer = (
    <div className="dubbing-editor-footer">
      <div className="dubbing-editor-footer-status">
        <Typography.Text type="secondary">
          {side
            ? "调整先存入本组草稿"
            : !value.uk || !value.us
              ? `还需选择${!value.uk ? "英式" : "美式"}声音`
              : "英美声音已选齐"}
          ，保存当前组后生效。
        </Typography.Text>
        {!side && error && (
          <Typography.Text type="danger" role="alert">
            {error}
          </Typography.Text>
        )}
      </div>
      <Space>
        <Button onClick={onCancel}>取消</Button>
        <Button type="primary" disabled={disabled} onClick={save}>
          {side ? "保存到本组" : "保存整套推荐"}
        </Button>
      </Space>
    </div>
  );
  return (
    <Drawer
      open
      title={
        side ? (
          <div className="dubbing-editor-title">
            <Typography.Text type="secondary">
              {sideName(side)}声音 · {initial.name}
            </Typography.Text>
            <Typography.Title level={4}>配音设置</Typography.Title>
          </div>
        ) : (
          <div className="dubbing-pair-editor-title">
            <Typography.Title level={4}>
              {legacy
                ? "组合原有声音"
                : initial.uk && initial.us
                  ? "复制整套推荐"
                  : "新建整套推荐"}
            </Typography.Title>
            <Typography.Text type="secondary">
              分别选择英美声音，组成一套适用于本组的配音推荐。
            </Typography.Text>
          </div>
        )
      }
      size={side ? 560 : 1120}
      onClose={onCancel}
      destroyOnHidden
      className={side ? "dubbing-editor-drawer" : "dubbing-pair-editor"}
      footer={footer}
    >
      {content}
    </Drawer>
  );
}
