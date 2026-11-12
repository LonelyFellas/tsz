import { useVoiceEditorTranslation } from "../i18n";
import { Undo2Icon } from "lucide-react";
import { Alert, Button, Flex, Typography, Space } from "@tsz/ui/admin/display";
import { Form, InputNumber, Select } from "@tsz/ui/admin/forms";
import type { AdminSpeechVoice } from "@tsz/types";
import { SpeechRateInput } from "./SpeechRateInput";
import { SpeechVolumeInput } from "./SpeechVolumeInput";
import { voiceStyleNames } from "./voice-style-labels";
import "./voice-parameter-fields.css";

export type ParameterVoice = Pick<AdminSpeechVoice, "capabilities"> & {
  capability_evidence?: Pick<
    NonNullable<AdminSpeechVoice["capability_evidence"]>,
    "roles" | "supports_style_degree"
  >;
};

export interface VoiceParameterValues {
  rate_percent: number;
  pitch_semitones: number;
  volume_percent: number;
  style: string;
  style_degree?: number;
  role?: string;
}

export function defaultVoiceParameters(
  voice: ParameterVoice
): VoiceParameterValues {
  const caps = voice.capabilities;
  return {
    rate_percent: Math.max(
      caps.min_rate_percent,
      Math.min(0, caps.max_rate_percent)
    ),
    pitch_semitones: Math.max(
      caps.min_pitch_semitones,
      Math.min(0, caps.max_pitch_semitones)
    ),
    volume_percent: 100,
    style: "",
    style_degree: undefined,
    role: undefined
  };
}

export function VoiceParameterFields({
  voice,
  disabled,
  volume,
  style,
  resetDisabled,
  onReset,
  labels = {},
  rateBounds
}: {
  voice: ParameterVoice;
  disabled: boolean;
  volume?: number | null;
  style?: string | null;
  resetDisabled: boolean;
  onReset: () => void;
  labels?: Partial<
    Record<"rate" | "volume" | "pitch" | "style" | "degree" | "role", string>
  >;
  rateBounds?: { min: number; max: number };
}) {
  const { t } = useVoiceEditorTranslation();
  const capabilities = voice.capabilities;
  const rateMin =
    rateBounds?.min ?? Math.max(-70, capabilities.min_rate_percent);
  const rateMax =
    rateBounds?.max ?? Math.min(70, capabilities.max_rate_percent);
  const form = Form.useFormInstance<VoiceParameterValues>();
  const degree = Form.useWatch<number | null>("style_degree", form);
  const role = Form.useWatch<string | null>("role", form);
  const supportsDegree = !!voice.capability_evidence?.supports_style_degree;
  const supportsRole = !!voice.capability_evidence?.roles?.length;
  const hasAdvanced = supportsDegree || supportsRole;
  const advancedHint = !hasAdvanced
    ? degree != null || role
      ? t(
          "this_voice_does_not_support_adjustments_existing_settings_are_retained"
        )
      : t("this_voice_has_no_adjustable_advanced_parameters")
    : !style
      ? t("select_a_speaking_style_before_adjusting_advanced_parameters")
      : (!supportsDegree && degree != null) || (!supportsRole && role)
        ? t("some_existing_values_cannot_be_adjusted_and_will_be_retained")
        : undefined;
  return (
    <div className="voice-parameter-panel">
      <Flex
        className="voice-parameter-heading"
        justify="space-between"
        align="center"
        gap={8}
      >
        <Space size={8}>
          <Typography.Text strong>{t("voice_parameters")}</Typography.Text>
          <span className="voice-parameter-muted-status" role="status">
            {volume === 0 ? t("muted") : ""}
          </span>
        </Space>
        <Button
          type="text"
          size="small"
          icon={<Undo2Icon />}
          aria-label={t("restore_default_parameters")}
          disabled={disabled || resetDisabled}
          onClick={onReset}
        >
          {t("reset")}
        </Button>
      </Flex>
      {capabilities.supports_volume_percent === false && (
        <Alert
          type="info"
          showIcon
          title={t("this_voice_uses_fixed_parameters")}
        />
      )}
      <section
        className="voice-parameter-section"
        aria-label={t("common_parameters")}
      >
        <Typography.Text strong>{t("common_parameters")}</Typography.Text>
        <div className="voice-parameter-fields">
          <Form.Item
            layout="horizontal"
            colon={false}
            name="volume_percent"
            label={t("volume")}
            tooltip={t("100_is_the_original_volume_0_is_mute")}
            rules={[
              {
                required: true,
                type: "integer",
                min: capabilities.supports_volume_percent === false ? 100 : 0,
                max: 100,
                message:
                  capabilities.supports_volume_percent === false
                    ? t(
                        "this_model_only_supports_the_original_volume_restore_default_parameters_exp"
                      )
                    : t("enter_an_integer_from_0_to_100")
              }
            ]}
          >
            <SpeechVolumeInput
              ariaLabel={labels.volume}
              disabled={
                disabled || capabilities.supports_volume_percent === false
              }
            />
          </Form.Item>
          <div className="voice-parameter-grid">
            <Form.Item
              layout="horizontal"
              colon={false}
              name="rate_percent"
              className="voice-parameter-number"
              label={t("rate")}
              rules={[
                {
                  required: true,
                  type: "integer",
                  min: rateMin,
                  max: rateMax,
                  message: t("enter_a_rate_between_and", {
                    p0: ((100 + rateMin) / 100).toFixed(2),
                    p1: ((100 + rateMax) / 100).toFixed(2)
                  })
                }
              ]}
              tooltip={
                capabilities.min_rate_percent === capabilities.max_rate_percent
                  ? t("this_voice_uses_a_fixed_rate")
                  : t("1_00_is_the_standard_rate")
              }
            >
              <SpeechRateInput
                compact
                aria-label={labels.rate ?? t("synthesis_rate")}
                min={rateMin}
                max={rateMax}
                disabled={
                  disabled ||
                  capabilities.min_rate_percent ===
                    capabilities.max_rate_percent
                }
                style={{ width: "100%" }}
              />
            </Form.Item>
          </div>
        </div>
      </section>
      <section
        className="voice-parameter-section voice-parameter-advanced"
        aria-label={t("other_parameters")}
      >
        <Typography.Text strong>{t("other_parameters")}</Typography.Text>
        {advancedHint && (
          <Typography.Paragraph
            className="voice-parameter-hint"
            type="secondary"
          >
            {advancedHint}
          </Typography.Paragraph>
        )}
        <div className="voice-parameter-grid">
          <Form.Item
            layout="horizontal"
            colon={false}
            name="pitch_semitones"
            className="voice-parameter-number"
            label={t("pitch_2")}
            rules={[
              {
                required: true,
                type: "integer",
                min: capabilities.min_pitch_semitones,
                max: capabilities.max_pitch_semitones,
                message: t("enter_an_integer_from_to", {
                  p0: capabilities.min_pitch_semitones,
                  p1: capabilities.max_pitch_semitones
                })
              }
            ]}
            tooltip={
              capabilities.min_pitch_semitones ===
              capabilities.max_pitch_semitones
                ? t("this_voice_uses_a_fixed_pitch")
                : t(
                    "0_keeps_the_original_pitch_positive_values_raise_it_and_negative_values_low"
                  )
            }
          >
            <InputNumber
              aria-label={labels.pitch ?? t("pitch_2")}
              suffix={t("semitones")}
              min={capabilities.min_pitch_semitones}
              max={capabilities.max_pitch_semitones}
              disabled={
                disabled ||
                capabilities.min_pitch_semitones ===
                  capabilities.max_pitch_semitones
              }
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item name="style" label={t("speaking_style")}>
            <Select
              aria-label={labels.style ?? t("speaking_style")}
              disabled={disabled || capabilities.styles.length === 0}
              options={[
                { value: "", label: t("default") },
                ...capabilities.styles.map((style) => ({
                  value: style,
                  label: voiceStyleNames(t)[style] ?? style
                }))
              ]}
            />
          </Form.Item>

          <Form.Item
            layout="horizontal"
            colon={false}
            name="style_degree"
            className="voice-parameter-number"
            label={t("style_intensity")}
            getValueProps={(value: number | undefined) => ({
              value:
                value === undefined ? 1 : Number.isFinite(value) ? value : null
            })}
            rules={[
              {
                type: "number",
                min: 0.01,
                max: 2,
                message: t("enter_a_style_intensity_from_0_01_to_2")
              }
            ]}
          >
            <InputNumber
              aria-label={labels.degree ?? t("style_intensity")}
              min={0.01}
              max={2}
              step={0.1}
              precision={2}
              disabled={
                disabled ||
                !style ||
                !voice.capability_evidence?.supports_style_degree
              }
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            layout="horizontal"
            colon={false}
            name="role"
            label={t("role")}
            getValueProps={(value?: string) => ({ value: value ?? "" })}
          >
            <Select
              aria-label={labels.role ?? t("role")}
              disabled={
                disabled || !style || !voice.capability_evidence?.roles?.length
              }
              options={[
                { value: "", label: t("default") },
                ...(voice.capability_evidence?.roles ?? []).map((role) => ({
                  value: role,
                  label: role
                }))
              ]}
            />
          </Form.Item>
        </div>
      </section>
    </div>
  );
}
