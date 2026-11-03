import { UndoOutlined } from "@ant-design/icons";
import {
  Alert,
  Button,
  Flex,
  Form,
  Collapse,
  InputNumber,
  Select,
  Typography,
  Space
} from "antd";
import type { AdminSpeechVoice } from "@tsz/types";
import { SpeechRateInput } from "./SpeechRateInput";
import { SpeechVolumeInput } from "./SpeechVolumeInput";
import { styleNames } from "./voice-style-labels";
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
  const showDegree = (supportsDegree && !!style) || degree != null;
  const showRole = (supportsRole && !!style) || !!role;
  const advancedHint = !hasAdvanced
    ? degree != null || role
      ? "当前音色不支持调整，已有设置仍会保留。"
      : "此音色没有可调的高级参数。"
    : !style
      ? "先选择说话风格，再调节高级参数。"
      : (!supportsDegree && degree != null) || (!supportsRole && role)
        ? "部分已有值不支持调整，仍会保留。"
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
          <Typography.Text strong>声音参数</Typography.Text>
          <span className="voice-parameter-muted-status" role="status">
            {volume === 0 ? "已静音" : ""}
          </span>
        </Space>
        <Button
          type="text"
          size="small"
          icon={<UndoOutlined />}
          aria-label="恢复默认参数"
          disabled={disabled || resetDisabled}
          onClick={onReset}
        >
          重置
        </Button>
      </Flex>
      {capabilities.supports_volume_percent === false && (
        <Alert type="info" showIcon title="此音色使用固定参数" />
      )}
      <div className="voice-parameter-fields">
        <Form.Item
          layout="horizontal"
          colon={false}
          name="volume_percent"
          label="音量"
          tooltip="100% 为原音量，0% 为静音。"
          rules={[
            {
              required: true,
              type: "integer",
              min: capabilities.supports_volume_percent === false ? 100 : 0,
              max: 100,
              message:
                capabilities.supports_volume_percent === false
                  ? "该模型仅支持原音量，请明确恢复默认参数"
                  : "请输入 0 至 100 的整数"
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
            label="语速"
            rules={[
              {
                required: true,
                type: "integer",
                min: rateMin,
                max: rateMax,
                message: `请输入 ${((100 + rateMin) / 100).toFixed(2)} 至 ${((100 + rateMax) / 100).toFixed(2)} 倍速`
              }
            ]}
            tooltip={
              capabilities.min_rate_percent === capabilities.max_rate_percent
                ? "该音色使用固定语速。"
                : "1.00× 为标准语速。"
            }
          >
            <SpeechRateInput
              compact
              aria-label={labels.rate ?? "合成语速"}
              min={rateMin}
              max={rateMax}
              disabled={
                disabled ||
                capabilities.min_rate_percent === capabilities.max_rate_percent
              }
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            layout="horizontal"
            colon={false}
            name="pitch_semitones"
            className="voice-parameter-number"
            label="音调"
            rules={[
              {
                required: true,
                type: "integer",
                min: capabilities.min_pitch_semitones,
                max: capabilities.max_pitch_semitones,
                message: `请输入 ${capabilities.min_pitch_semitones} 至 ${capabilities.max_pitch_semitones} 的整数`
              }
            ]}
            tooltip={
              capabilities.min_pitch_semitones ===
              capabilities.max_pitch_semitones
                ? "该音色使用固定音调。"
                : "0 保持原音调，正数升高，负数降低。"
            }
          >
            <InputNumber
              aria-label={labels.pitch ?? "音调"}
              suffix="半音"
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
        </div>
        <Form.Item name="style" label="说话风格">
          <Select
            aria-label={labels.style ?? "说话风格"}
            disabled={disabled}
            options={[
              { value: "", label: "默认" },
              ...capabilities.styles.map((style) => ({
                value: style,
                label: styleNames[style] ?? style
              }))
            ]}
          />
        </Form.Item>
      </div>
      <Collapse
        ghost
        className="voice-parameter-advanced"
        styles={{ header: { padding: "6px 0" }, body: { padding: "4px 0 0" } }}
        items={[
          {
            key: "expression",
            label: "高级参数",
            extra: (
              <Typography.Text
                className="voice-parameter-advanced-status"
                type="secondary"
              >
                {!hasAdvanced
                  ? "无可调项"
                  : !style
                    ? "选择风格后可调"
                    : [supportsDegree && "风格强度", supportsRole && "角色"]
                        .filter(Boolean)
                        .join(" · ")}
              </Typography.Text>
            ),
            forceRender: true,
            children: (
              <>
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
                    name="style_degree"
                    className="voice-parameter-number"
                    hidden={!showDegree}
                    label="风格强度"
                    getValueProps={(value: number | undefined) => ({
                      value:
                        value === undefined
                          ? 1
                          : Number.isFinite(value)
                            ? value
                            : null
                    })}
                    rules={[
                      {
                        type: "number",
                        min: 0.01,
                        max: 2,
                        message: "请输入 0.01 至 2 的风格强度"
                      }
                    ]}
                  >
                    <InputNumber
                      aria-label={labels.degree ?? "风格强度"}
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
                    hidden={!showRole}
                    label="角色"
                    getValueProps={(value?: string) => ({ value: value ?? "" })}
                  >
                    <Select
                      aria-label={labels.role ?? "角色"}
                      disabled={
                        disabled ||
                        !style ||
                        !voice.capability_evidence?.roles?.length
                      }
                      options={[
                        { value: "", label: "默认" },
                        ...(voice.capability_evidence?.roles ?? []).map(
                          (role) => ({ value: role, label: role })
                        )
                      ]}
                    />
                  </Form.Item>
                </div>
              </>
            )
          }
        ]}
      />
    </div>
  );
}
