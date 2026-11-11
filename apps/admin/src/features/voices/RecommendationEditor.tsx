import {
  useVoiceTranslation,
  voiceMessage,
  useVoiceMessageState
} from "./i18n";
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
  const { t } = useVoiceTranslation();
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
  const [error, setError] = useVoiceMessageState();
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
    const name = value.name?.trim() || t("unnamed_recommendation");
    if (Array.from(name).length > 40) {
      setError(
        voiceMessage("recommendation_names_must_be_at_most_40_characters")
      );
      return;
    }
    for (const key of sides) {
      const next = value[key];
      if (!next) {
        setActiveSide(key);
        setSearch("");
        setError({
          format: (t) => t("choose_pair_side", { side: sideName(key, t) })
        });
        return;
      }
      if (!side || side === key) {
        const issue = recommendationError(
          t("recommendation"),
          key,
          { ...next, name },
          voices.find((v) => v.alias === next.voice_alias)
        );
        if (issue) {
          setActiveSide(key);
          setError({
            format: (t) =>
              recommendationError(
                t("recommendation"),
                key,
                { ...next, name },
                voices.find((v) => v.alias === next.voice_alias),
                t
              ) ?? ""
          });
          return;
        }
      }
    }
    onSave({
      id: value.id ?? newWordNodeId(),
      name,
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
          {t("side_parameters", { side: sideName(activeSide, t) })}
        </Typography.Title>
        <Typography.Paragraph type="secondary">
          {t(
            "select_a_voice_from_the_catalog_to_adjust_its_parameters_and_prev"
          )}
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
          <Form.Item label={t("side_voice", { side: sideName(side, t) })}>
            <Select
              aria-label={t("side_voice", { side: sideName(side, t) })}
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
            <Form.Item
              label={t("recommendation_name")}
              layout="horizontal"
              colon={false}
            >
              <Input
                aria-label={t("recommendation_name")}
                placeholder={t("e_g_natural_reading_or_slow_practice")}
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
              {t("select_the_whole_recommendation_pair")}
            </Checkbox>
          </div>
          {legacy && (
            <Alert
              type="info"
              title={t(
                "select_existing_voices_to_pair_or_add_a_missing_side_all_existing"
              )}
            />
          )}
          {legacy && (
            <Flex gap={16} wrap>
              {sides.map((key) => (
                <Form.Item
                  key={key}
                  label={t("legacy_side", { side: sideName(key, t) })}
                >
                  <Select
                    aria-label={t("select_legacy_side", {
                      side: sideName(key, t)
                    })}
                    value={
                      legacy[key].some((i) => i.id === value[key]?.id)
                        ? value[key]?.id
                        : undefined
                    }
                    placeholder={t("select_an_existing_voice_or_add_one_below")}
                    style={{ width: 300 }}
                    options={[
                      {
                        value: "__new__",
                        label: t("add_a_voice_select_below")
                      },
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
            aria-label={t("british_and_american_voice_pair")}
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
                  aria-label={t("configure_side", { side: sideName(key, t) })}
                  aria-pressed={activeSide === key}
                  onClick={() => {
                    setActiveSide(key);
                    setSearch("");
                  }}
                >
                  <span className="dubbing-selection-label">
                    {t("side_voice", { side: sideName(key, t) })}
                  </span>
                  <span className="dubbing-selection-name">
                    {chosen ? (
                      <VoiceName voice={chosen} />
                    ) : selected ? (
                      selected.voice_alias
                    ) : (
                      t("voice_not_selected")
                    )}
                  </span>
                  <span className="dubbing-selection-parameters">
                    {selected
                      ? `${Number.isFinite(rate) ? ((rate! + 100) / 100).toFixed(2) : "—"}× · ${Number.isFinite(volume) ? volume : "—"}%`
                      : t("select_from_catalog")}
                  </span>
                </Button>
              );
            })}
          </div>
          <div className="dubbing-pair-workspace">
            <section
              className="dubbing-voice-picker"
              aria-label={t("side_catalog", { side: sideName(activeSide, t) })}
            >
              <div className="dubbing-picker-heading">
                <Typography.Title level={5}>
                  {t("select_side_voice", { side: sideName(activeSide, t) })}
                </Typography.Title>
                <Typography.Text type="secondary">
                  {t("voice_count_short", { count: candidates.length })}
                </Typography.Text>
              </div>
              <div className="dubbing-picker-filters">
                <Input.Search
                  aria-label={t("search_recommendation_voices")}
                  placeholder={t("search_name_or_official_id")}
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  allowClear
                />
                <Segmented
                  aria-label={t("voice_gender")}
                  value={gender}
                  onChange={setGender}
                  options={[
                    { value: "all", label: t("all") },
                    { value: "female", label: t("female_voice") },
                    { value: "male", label: t("male_voice") }
                  ]}
                />
              </div>
              <div
                className="dubbing-picker-list"
                ref={catalog}
                tabIndex={0}
                aria-label={t("side_scroll_list", {
                  side: sideName(activeSide, t)
                })}
              >
                {candidates.length ? (
                  <Radio.Group
                    className="dubbing-picker-radios"
                    aria-label={t("select_side_voice", {
                      side: sideName(activeSide, t)
                    })}
                    value={item?.voice_alias}
                    disabled={disabled}
                    onChange={(event) => {
                      const chosen = candidates.find(
                        (candidate) => candidate.alias === event.target.value
                      );
                      if (chosen) chooseVoice(chosen);
                    }}
                  >
                    {candidates.map((candidate) => (
                      <div
                        key={candidate.alias}
                        className={`dubbing-picker-option${item?.voice_alias === candidate.alias ? " is-selected" : ""}`}
                      >
                        <Radio
                          value={candidate.alias}
                          disabled={
                            disabled || candidate.synthesis_available === false
                          }
                        >
                          <VoiceName voice={candidate} />
                          <span className="dubbing-picker-badge" aria-hidden>
                            {candidate.synthesis_available === false
                              ? t("unavailable")
                              : candidate.is_common
                                ? t("common")
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
                    ))}
                  </Radio.Group>
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={t(
                      "no_matching_voices_adjust_the_search_or_filters"
                    )}
                  />
                )}
              </div>
            </section>
            <section
              className="dubbing-pair-controls-panel"
              ref={controlsPanel}
              aria-label={t("side_parameters_preview", {
                side: sideName(activeSide, t)
              })}
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
            ? t("editor_status_side")
            : !value.uk || !value.us
              ? t("editor_status_missing", {
                  side: sideName(!value.uk ? "uk" : "us", t)
                })
              : t("editor_status_complete")}
        </Typography.Text>
        {!side && error && (
          <Typography.Text type="danger" role="alert">
            {error}
          </Typography.Text>
        )}
      </div>
      <Space>
        <Button onClick={onCancel}>{t("cancel")}</Button>
        <Button type="primary" disabled={disabled} onClick={save}>
          {side ? t("save_to_this_group") : t("save_recommendation_pair")}
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
              {t("side_voice_name", {
                side: sideName(side, t),
                name: initial.name ?? ""
              })}
            </Typography.Text>
            <Typography.Title level={4}>
              {t("dubbing_settings")}
            </Typography.Title>
          </div>
        ) : (
          <div className="dubbing-pair-editor-title">
            <Typography.Title level={4}>
              {legacy
                ? t("pair_existing_voices")
                : initial.uk && initial.us
                  ? t("copy_recommendation_pair")
                  : t("create_recommendation_pair_d3784a")}
            </Typography.Title>
            <Typography.Text type="secondary">
              {t(
                "select_british_and_american_voices_to_create_a_recommendation_pai"
              )}
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
