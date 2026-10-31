import { useLayoutEffect, useRef, useState } from "react";
import { speechAccentGroup } from "@tsz/shared";
import type {
  AdminDubbingRecommendationPair,
  AdminSpeechVoice,
  AdminDubbingRecommendation
} from "@tsz/types";
import {
  Alert,
  Button,
  Checkbox,
  Flex,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Select,
  Space,
  Typography
} from "antd";
import { newWordNodeId } from "@/features/dictionary/word-model/primitives";
import {
  newPairVoice,
  recommendationError,
  sides,
  sideName,
  type DubbingSide
} from "./dubbing-model";
import { SpeechRateInput } from "./SpeechRateInput";
import { styleNames } from "./voice-labels";
import { VoiceName } from "./VoiceDisplay";

export type RecommendationSeed = Partial<
  Pick<AdminDubbingRecommendationPair, "uk" | "us">
> & { id?: string; name?: string; selected?: boolean };

export function RecommendationEditor({
  voices,
  initial,
  side,
  legacy,
  disabled,
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
  onSave: (pair: AdminDubbingRecommendationPair) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState<RecommendationSeed>(() =>
    structuredClone(initial)
  );
  const [search, setSearch] = useState("");
  const columns = useRef(new Map<string, HTMLDivElement>());
  const positions = useRef(new Map<string, { top: number; height: number }>());
  function searchVoices(next: string) {
    if (!search && next)
      columns.current.forEach((list, key) =>
        positions.current.set(key, {
          top: list.scrollTop,
          height: list.scrollHeight
        })
      );
    setSearch(next);
  }
  useLayoutEffect(() => {
    columns.current.forEach((list, key) => {
      const saved = positions.current.get(key);
      if (saved) list.scrollTop = saved.top;
    });
  }, [search]);

  const [activeSide, setActiveSide] = useState<DubbingSide>(side ?? "uk");
  const [error, setError] = useState<string>();
  const visibleSides = side ? [side] : sides;
  const item = value[activeSide];
  const voice = voices.find((v) => v.alias === item?.voice_alias);
  const caps = voice?.capabilities;
  const evidence = voice?.capability_evidence;
  function parameters(update: Partial<NonNullable<typeof item>["parameters"]>) {
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
    for (const key of sides) {
      const next = value[key];
      if (!next) {
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
  return (
    <Modal
      open
      title={
        side
          ? `修改${sideName(side)}配音设置`
          : legacy
            ? "人工配对／补齐历史推荐"
            : "新建／复制整套推荐"
      }
      width={1040}
      footer={null}
      onCancel={onCancel}
      destroyOnHidden
    >
      <Form component="div" layout="vertical" disabled={disabled}>
        {!side && (
          <Form.Item label="推荐名称">
            <Input
              aria-label="推荐名称"
              maxLength={40}
              value={value.name ?? ""}
              onChange={(e) =>
                setValue((v) => ({ ...v, name: e.target.value }))
              }
            />
          </Form.Item>
        )}
        {!side && (
          <Form.Item>
            <Checkbox
              checked={value.selected ?? !legacy}
              onChange={(e) =>
                setValue((v) => ({ ...v, selected: e.target.checked }))
              }
            >
              选用整套推荐
            </Checkbox>
          </Form.Item>
        )}
        {legacy && (
          <Alert
            type="info"
            showIcon
            title="请明确选择旧版本身份或新音色补齐；每个旧侧 ID 均须保留，不能按位置猜配。选定旧身份后更换音色仍保留该 ID。"
          />
        )}
        {legacy && (
          <Flex gap={16} wrap>
            {sides.map((key) => (
              <Form.Item key={key} label={`${sideName(key)}历史版本`}>
                <Select
                  aria-label={`${sideName(key)}历史版本`}
                  value={
                    legacy[key].some((i) => i.id === value[key]?.id)
                      ? value[key]?.id
                      : undefined
                  }
                  placeholder="选择旧版本，或在下方选择新音色"
                  style={{ width: 300 }}
                  options={[
                    { value: "__new__", label: "新身份（下方选择音色）" },
                    ...legacy[key].map((i) => ({
                      value: i.id,
                      label: `${i.name} · ${i.voice_alias} · ${i.id}`
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
        <Input.Search
          aria-label="搜索推荐音色"
          placeholder="搜索音色名称或官方 ID"
          value={search}
          onChange={(e) => searchVoices(e.target.value)}
          allowClear
        />
        <div className="dubbing-catalog-scroll">
          <div
            className={`dubbing-catalog-columns${side ? " is-single-side" : ""}`}
          >
            {visibleSides.flatMap((key) =>
              ["female", "male"].map((gender) => (
                <section
                  key={`${key}-${gender}`}
                  className="dubbing-catalog-column"
                  aria-label={`${sideName(key)}${gender === "female" ? "女声" : "男声"}目录`}
                >
                  <Typography.Text
                    className={`dubbing-catalog-title voice-accent-${key}`}
                  >
                    {sideName(key)} · {gender === "female" ? "女声" : "男声"}
                  </Typography.Text>
                  <div
                    ref={(node) => {
                      const columnId = `${key}-${gender}`;
                      if (node) columns.current.set(columnId, node);
                      else columns.current.delete(columnId);
                    }}
                    className="dubbing-catalog-list"
                    tabIndex={0}
                    aria-label={`${sideName(key)}${gender === "female" ? "女声" : "男声"}滚动列表`}
                  >
                    <div
                      className="dubbing-catalog-content"
                      style={
                        search
                          ? {
                              paddingTop:
                                positions.current.get(`${key}-${gender}`)
                                  ?.top ?? 0,
                              minHeight: positions.current.get(
                                `${key}-${gender}`
                              )?.height
                            }
                          : undefined
                      }
                    >
                      {voices
                        .filter(
                          (v) =>
                            v.gender.toLowerCase() === gender &&
                            speechAccentGroup(v.locale, v.accent) === key
                        )
                        .map((v) => (
                          <div
                            key={v.alias}
                            hidden={
                              !`${v.display_name} ${v.metadata?.provider_voice_id ?? v.alias}`
                                .toLowerCase()
                                .includes(search.trim().toLowerCase())
                            }
                          >
                            <Radio
                              checked={value[key]?.voice_alias === v.alias}
                              disabled={
                                disabled || v.synthesis_available === false
                              }
                              onChange={() => {
                                setActiveSide(key);
                                setValue((current) =>
                                  current[key]?.voice_alias === v.alias
                                    ? current
                                    : {
                                        ...current,
                                        [key]: {
                                          ...newPairVoice(v),
                                          ...(current[key]
                                            ? { id: current[key]!.id }
                                            : {})
                                        }
                                      }
                                );
                              }}
                            >
                              <VoiceName voice={v} />
                            </Radio>
                            <Typography.Text
                              type="secondary"
                              code
                              className="dubbing-provider-id"
                              copyable
                            >
                              {v.metadata?.provider_voice_id ?? v.alias}
                            </Typography.Text>
                          </div>
                        ))}
                    </div>
                  </div>
                </section>
              ))
            )}
          </div>
        </div>
        {!side && (
          <Radio.Group
            aria-label="当前调参口音"
            value={activeSide}
            onChange={(e) => setActiveSide(e.target.value)}
            className="dubbing-side-switch"
          >
            {sides.map((key) => (
              <Radio.Button
                key={key}
                value={key}
                className={`dubbing-side-${key}`}
              >
                {sideName(key)}
                {value[key] ? "（已选）" : "（待选）"}
              </Radio.Button>
            ))}
          </Radio.Group>
        )}
        <section className="dubbing-parameter-panel">
          <Typography.Title level={5}>常用参数</Typography.Title>
          {!item ? (
            <Typography.Paragraph type="secondary">
              请先选择{sideName(activeSide)}音色。
            </Typography.Paragraph>
          ) : (
            <>
              <Typography.Paragraph>
                {voice ? <VoiceName voice={voice} /> : item.voice_alias}
              </Typography.Paragraph>
              <Flex gap={16} wrap>
                <Form.Item label="语速（倍速）">
                  <SpeechRateInput
                    aria-label="推荐语速"
                    value={item.parameters.rate_percent}
                    min={caps?.min_rate_percent ?? 0}
                    max={caps?.max_rate_percent ?? 0}
                    disabled={
                      !caps || caps.min_rate_percent === caps.max_rate_percent
                    }
                    onChange={(rate_percent) =>
                      parameters({ rate_percent: rate_percent ?? Number.NaN })
                    }
                  />
                </Form.Item>
                <Form.Item label="音量">
                  <InputNumber
                    aria-label="推荐音量"
                    min={0}
                    max={100}
                    precision={0}
                    suffix={<small className="voice-shared-unit">%</small>}
                    value={item.parameters.volume_percent ?? 100}
                    disabled={!caps || caps.supports_volume_percent === false}
                    onChange={(v) =>
                      parameters({ volume_percent: v ?? Number.NaN })
                    }
                  />
                </Form.Item>
              </Flex>
              {caps?.supports_volume_percent === false && (
                <Typography.Paragraph type="secondary">
                  该模型仅支持原音量；旧值保留。
                  {(item.parameters.volume_percent ?? 100) !== 100 && (
                    <Button onClick={() => parameters({ volume_percent: 100 })}>
                      恢复原音量
                    </Button>
                  )}
                </Typography.Paragraph>
              )}
            </>
          )}
        </section>
        <section className="dubbing-parameter-panel">
          <Typography.Title level={5}>其他参数</Typography.Title>
          {item && (
            <Flex gap={16} wrap>
              <Form.Item label="说话风格">
                <Select
                  aria-label="推荐风格"
                  style={{ width: 160 }}
                  value={item.parameters.style ?? ""}
                  disabled={!caps?.styles.length}
                  options={[
                    { value: "", label: "默认" },
                    ...(caps?.styles ?? []).map((style) => ({
                      value: style,
                      label: styleNames[style] ?? style
                    }))
                  ]}
                  onChange={(style) => parameters({ style: style || null })}
                />
              </Form.Item>
              <Form.Item label="风格强度">
                <InputNumber
                  aria-label="推荐风格强度"
                  min={0.01}
                  max={2}
                  step={0.1}
                  precision={2}
                  value={item.parameters.style_degree ?? 1}
                  disabled={
                    !evidence?.supports_style_degree || !item.parameters.style
                  }
                  onChange={(v) =>
                    parameters({ style_degree: v ?? Number.NaN })
                  }
                />
              </Form.Item>
              <Form.Item label="角色">
                <Select
                  aria-label="推荐角色"
                  style={{ width: 150 }}
                  value={item.parameters.role ?? ""}
                  disabled={!evidence?.roles?.length}
                  options={[
                    { value: "", label: "默认" },
                    ...(evidence?.roles ?? []).map((role) => ({
                      value: role,
                      label: role
                    }))
                  ]}
                  onChange={(role) => parameters({ role: role || undefined })}
                />
              </Form.Item>
              <Form.Item label="音调（半音）">
                <InputNumber
                  aria-label="推荐音调"
                  min={caps?.min_pitch_semitones ?? 0}
                  max={caps?.max_pitch_semitones ?? 0}
                  precision={0}
                  value={item.parameters.pitch_semitones}
                  disabled={
                    !caps ||
                    caps.min_pitch_semitones === caps.max_pitch_semitones
                  }
                  onChange={(v) =>
                    parameters({ pitch_semitones: v ?? Number.NaN })
                  }
                />
              </Form.Item>
            </Flex>
          )}
          <Typography.Paragraph type="secondary">
            参数范围以真实能力为准；不支持的参数不可调整，已有值保留并在保存时校验。
          </Typography.Paragraph>
        </section>
        {error && <Alert type="error" showIcon title={error} />}
        {item && (
          <Button
            type="link"
            disabled={disabled}
            onClick={() =>
              parameters({
                style: null,
                style_degree: undefined,
                role: undefined,
                pitch_semitones: caps
                  ? Math.max(
                      caps.min_pitch_semitones,
                      Math.min(0, caps.max_pitch_semitones)
                    )
                  : item.parameters.pitch_semitones
              })
            }
          >
            恢复其他参数默认值
          </Button>
        )}
        <Space>
          <Button type="primary" disabled={disabled} onClick={save}>
            {side ? "保存配音设置" : "保存整套推荐"}
          </Button>
          <Button onClick={onCancel}>取消</Button>
        </Space>
        <Typography.Paragraph type="secondary">
          此处只更新本组草稿，回到分组点击“完成”才持久保存。
        </Typography.Paragraph>
      </Form>
    </Modal>
  );
}
