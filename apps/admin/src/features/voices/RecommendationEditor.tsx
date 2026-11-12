import {
  useVoiceTranslation,
  voiceMessage,
  useVoiceMessageState
} from "./i18n";
import { useLayoutEffect, useRef, useState } from "react";
import { speechAccentGroup } from "@tsz/shared";
import type {
  AdminSpeechVoice,
  AdminDubbingRecommendation,
  AdminVoiceParameters
} from "@tsz/types";
import { Button, Space, Typography } from "@tsz/ui/admin/display";
import { Checkbox, Form, Input, Radio } from "@tsz/ui/admin/forms";
import { Drawer } from "@tsz/ui/admin/overlays";
import {
  newRecommendationVoice,
  recommendationError,
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

export type RecommendationSeed = Partial<AdminDubbingRecommendation>;
type ParameterFormValues = {
  [Key in keyof VoiceParameterValues]: VoiceParameterValues[Key] | null;
};

export function RecommendationEditor({
  voices,
  initial,
  side,
  disabled,
  onBeforeAudition,
  onSave,
  onCancel
}: {
  voices: AdminSpeechVoice[];
  initial: RecommendationSeed;
  side: DubbingSide;
  disabled: boolean;
  onBeforeAudition?: () => void;
  onSave: (item: AdminDubbingRecommendation) => void;
  onCancel: () => void;
}) {
  const { t } = useVoiceTranslation();
  const [parameterForm] = Form.useForm<ParameterFormValues>();
  const [value, setValue] = useState<RecommendationSeed>(() =>
    structuredClone(initial)
  );
  const [trialSources, setTrialSources] = useState<
    Record<string, VoiceTrialSource>
  >({});
  const [ssmlDrafts, setSsmlDrafts] = useState<Record<string, SsmlDraft>>({});
  const voiceDrafts = useRef(new Map<string, AdminVoiceParameters>());
  const [searches, setSearches] = useState({ female: "", male: "" });
  const lists = useRef(new Map<string, HTMLDivElement>());
  const positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    for (const gender of ["female", "male"] as const) {
      const list = lists.current.get(gender);
      if (list)
        list.scrollTop =
          positions.current.get(`${gender}:${searches[gender]}`) ?? 0;
    }
  }, [searches]);
  const [error, setError] = useVoiceMessageState();
  function chooseVoice(chosen: AdminSpeechVoice) {
    const current = value;
    if (current?.voice_alias === chosen.alias) return;
    // 在本次抽屉内暂存每个候选声音，切回时恢复参数。
    if (current.voice_alias && current.parameters)
      voiceDrafts.current.set(
        current.voice_alias,
        structuredClone(current.parameters)
      );
    const next = newRecommendationVoice(chosen);
    const saved = voiceDrafts.current.get(chosen.alias);
    if (saved) next.parameters = structuredClone(saved);
    if (current.id) next.id = current.id;
    setValue((previous) => ({ ...previous, ...next }));
    setError(undefined);
  }
  const item =
    value.voice_alias && value.parameters
      ? (value as AdminDubbingRecommendation)
      : undefined;
  const voice = voices.find((v) => v.alias === item?.voice_alias);
  function parameters(update: Partial<NonNullable<typeof item>["parameters"]>) {
    setError(undefined);
    setValue((current) => ({
      ...current,
      parameters: { ...item!.parameters, ...update }
    }));
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
    if (!item) {
      setError({
        format: (t) => t("choose_side_voice", { side: sideName(side, t) })
      });
      return;
    }
    const issue = recommendationError(
      t("recommendation"),
      side,
      { ...item, name },
      voice,
      t
    );
    if (issue) {
      setError({
        format: (t) =>
          recommendationError(
            t("recommendation"),
            side,
            { ...item, name },
            voice,
            t
          ) ?? ""
      });
      return;
    }
    onSave({ ...item, name, selected: value.selected ?? true });
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
  }, [parameterForm, item?.id, item?.voice_alias]);
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
          </>
        }
        audition={
          <DubbingAudition
            key={voice.alias}
            voice={voice}
            parameters={item.parameters}
            originalVoice={voices.find(
              (candidate) => candidate.alias === initial.voice_alias
            )}
            originalParameters={initial.parameters}
            side={side}
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
          {t("side_parameters", { side: sideName(side, t) })}
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
    >
      <Form.Item label={t("recommendation_name")}>
        <Input
          aria-label={t("recommendation_name")}
          value={value.name ?? ""}
          maxLength={40}
          onChange={(event) =>
            setValue((current) => ({ ...current, name: event.target.value }))
          }
        />
      </Form.Item>
      <Checkbox
        checked={value.selected ?? true}
        onChange={(event) =>
          setValue((current) => ({
            ...current,
            selected: event.target.checked
          }))
        }
      >
        {t("use_recommendation")}
      </Checkbox>
      <div
        className="dubbing-recommendation-catalog"
        role="group"
        aria-label={t("side_catalog", { side: sideName(side, t) })}
      >
        {(["female", "male"] as const).map((gender) => {
          const label = t(gender === "female" ? "female_voice" : "male_voice");
          const candidates = voices.filter(
            (voice) =>
              speechAccentGroup(voice.locale, voice.accent) === side &&
              (gender === "female"
                ? voice.gender.toLowerCase() === "female"
                : voice.gender.toLowerCase() !== "female") &&
              `${voice.display_name} ${voice.metadata?.provider_voice_id ?? voice.alias}`
                .toLowerCase()
                .includes(searches[gender].trim().toLowerCase())
          );
          return (
            <section key={gender}>
              <Typography.Text>{label}</Typography.Text>
              <Input.Search
                aria-label={t("search_side_gender", {
                  side: sideName(side, t),
                  gender: label
                })}
                placeholder={t("search_name_or_official_id")}
                value={searches[gender]}
                allowClear
                onChange={(event) =>
                  setSearches((current) => ({
                    ...current,
                    [gender]: event.target.value
                  }))
                }
              />
              <div
                className="dubbing-picker-list"
                ref={(node) => {
                  if (node) lists.current.set(gender, node);
                  else lists.current.delete(gender);
                }}
                onScroll={(event) =>
                  positions.current.set(
                    `${gender}:${searches[gender]}`,
                    event.currentTarget.scrollTop
                  )
                }
                tabIndex={0}
                aria-label={t("side_gender_catalog", {
                  side: sideName(side, t),
                  gender: label
                })}
              >
                <Radio.Group
                  aria-label={t("side_gender_voice", {
                    side: sideName(side, t),
                    gender: label
                  })}
                  value={item?.voice_alias}
                  disabled={disabled}
                  className="dubbing-picker-radios"
                  onChange={(event) => {
                    const chosen = voices.find(
                      (voice) => voice.alias === event.target.value
                    );
                    if (chosen) chooseVoice(chosen);
                  }}
                >
                  {candidates.map((candidate) => (
                    <div
                      key={candidate.alias}
                      className="dubbing-picker-option"
                    >
                      <Radio
                        value={candidate.alias}
                        disabled={candidate.synthesis_available === false}
                      >
                        <VoiceName voice={candidate} />
                      </Radio>
                      <Typography.Text className="dubbing-picker-id">
                        {candidate.metadata?.provider_voice_id ??
                          candidate.alias}
                      </Typography.Text>
                    </div>
                  ))}
                </Radio.Group>
                {!candidates.length && (
                  <Typography.Text type="secondary">
                    {t("no_matching_voices_adjust_the_search_or_filters")}
                  </Typography.Text>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {controls}
    </Form>
  );

  const footer = (
    <div className="dubbing-editor-footer">
      <div className="dubbing-editor-footer-status">
        <Typography.Text type="secondary">
          {t("editor_status_side")}
        </Typography.Text>
        {error && (
          <Typography.Text type="danger" role="alert">
            {error}
          </Typography.Text>
        )}
      </div>
      <Space>
        <Button onClick={onCancel}>{t("cancel")}</Button>
        <Button
          type="primary"
          className="dubbing-accent-action"
          data-side={side}
          disabled={disabled}
          onClick={save}
        >
          {t("save_to_this_group")}
        </Button>
      </Space>
    </div>
  );
  return (
    <Drawer
      open
      title={
        initial.name
          ? t("side_voice_name", {
              side: sideName(side, t),
              name: initial.name
            })
          : t("new_side_recommendation", { side: sideName(side, t) })
      }
      size={820}
      onClose={onCancel}
      destroyOnHidden
      className="dubbing-editor-drawer"
      footer={footer}
    >
      {content}
    </Drawer>
  );
}
