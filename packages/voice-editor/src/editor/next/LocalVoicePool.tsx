import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  EditOutlined,
  SoundOutlined
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Checkbox,
  Input,
  Radio,
  Space,
  Spin,
  Tag,
  Typography
} from "antd";
import { speechAccentGroup } from "@tsz/shared";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { RichTextV2 } from "@tsz/types";
import type {
  AudioAssetLocale,
  VoiceOption,
  VoicePreviewAdapter,
  VoiceProfile,
  VoiceRecommendation,
  VoiceRecommendationArea,
  VoiceSetting
} from "../../types";
import {
  convertVoicePool,
  effectiveVoiceSetting,
  isVoiceRecommendationAvailable,
  providerVoiceKey,
  reorderPoolVoice,
  switchPoolRecommendation,
  togglePoolVoice,
  voicePoolConflicts,
  voicePoolProbabilities,
  voiceSettingKey
} from "../../core";
import { PoolVoiceName, PoolVoiceRate, PoolVoiceVolume } from "./VoiceDisplay";
import { VoiceDetail } from "./VoiceDetail";

const sides = [
  { key: "uk", locale: "en-GB", label: "英式" },
  { key: "us", locale: "en-US", label: "美式" }
] as const;

export function LocalVoicePool({
  profile,
  settings,
  voices,
  loading,
  recommendations,
  area,
  locale,
  content,
  sourceKey,
  adapter,
  readOnly,
  canAudition,
  pendingUpload,
  onChange,
  onAudition,
  onRestore,
  onOpenDetail,
  onCloseDetail,
  audioTools,
  error,
  unavailableVersions,
  previousAudio = []
}: {
  profile?: VoiceProfile | null;
  settings: VoiceSetting[];
  voices: VoiceOption[];
  loading: boolean;
  recommendations: VoiceRecommendation[];
  area: VoiceRecommendationArea;
  locale?: AudioAssetLocale;
  content: RichTextV2;
  sourceKey: string;
  adapter?: VoicePreviewAdapter;
  readOnly: boolean;
  canAudition: boolean;
  pendingUpload: boolean;
  onChange: (profile: VoiceProfile) => void;
  onAudition: (voice: VoiceOption, setting?: VoiceSetting) => void;
  onRestore: () => void;
  onOpenDetail: (dialect: "en-GB" | "en-US") => void;
  onCloseDetail: () => void;
  audioTools: (
    dialect: "en-GB" | "en-US",
    stopPlayback: () => void
  ) => ReactNode;
  error?: string;
  unavailableVersions?: ReadonlySet<string>;
  previousAudio?: VoiceSetting[];
}) {
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<{
    setting: VoiceSetting;
    profile: VoiceProfile;
    sourceKey: string;
    baseline: string;
    dialect: "en-GB" | "en-US";
  }>();
  useEffect(() => {
    if (
      detail &&
      (detail.sourceKey !== sourceKey ||
        detail.baseline !== JSON.stringify(profile ?? null))
    ) {
      setDetail(undefined);
      onCloseDetail();
    }
  }, [sourceKey, profile, detail, onCloseDetail]);
  const columns = useRef(new Map<string, HTMLDivElement>());
  const positions = useRef(new Map<string, number>());
  const unfilteredPositions = useRef(new Map<string, number>());
  const previousSearch = useRef("");
  useLayoutEffect(() => {
    columns.current.forEach((list, key) => {
      const saved =
        !search && previousSearch.current
          ? unfilteredPositions.current.get(key)
          : positions.current.get(key);
      if (saved !== undefined) list.scrollTop = saved;
    });
    previousSearch.current = search;
  }, [search, settings, recommendations]);
  const inherited = profile?.dubbing?.mode === "inherit";
  const converted = !!profile?.dubbing?.pool_version;
  // Resolved inheritance is a view. Only an explicit action materializes it.
  const current = converted && !inherited ? profile!.voices : settings;
  const conflicts = voicePoolConflicts(current, voices);
  const pairs = recommendations
    .filter((item) => item.pairId && item.groupId)
    .reduce<VoiceRecommendation[][]>((groups, item) => {
      const pair = groups.find(
        (group) =>
          group[0]!.pairId === item.pairId && group[0]!.groupId === item.groupId
      );
      if (pair) pair.push(item);
      else groups.push([item]);
      return groups;
    }, []);
  const inheritedPair = inherited
    ? pairs.find((pair) =>
        pair
          .filter((item) => !locale || item.locale === locale)
          .every((item) =>
            current.some(
              (setting) =>
                setting.enabled && voiceSettingKey(setting) === item.id
            )
          )
      )
    : undefined;
  const source = profile?.dubbing?.recommendation;
  const selectedPair = inherited
    ? inheritedPair
    : pairs.find(
        (pair) =>
          pair[0]!.pairId === source?.pair_id &&
          pair[0]!.groupId === source?.group_id
      );
  const excluded = new Set(
    (inherited
      ? inheritedPair?.map((item) => item.setting.voice_id)
      : source?.voice_ids
    )?.map((id) => providerVoiceKey(id, voices)) ?? []
  );
  const probabilities = voicePoolProbabilities(
    current.filter((item) => !unavailableVersions?.has(voiceSettingKey(item))),
    voices,
    content,
    locale
  );
  function materialize(): VoiceProfile | undefined {
    if (conflicts.length) {
      setNotice("请先在历史冲突中明确选择保留配置，再转换为新池。");
      return;
    }
    const local = convertVoicePool(profile, current, voices, area);
    if (inherited) {
      const contributed = current
        .filter((item) => item.enabled)
        .map(voiceSettingKey);
      const pair = inheritedPair?.[0];
      if (pair?.groupId && pair.pairId)
        local.dubbing!.recommendation = {
          group_id: pair.groupId,
          pair_id: pair.pairId,
          voice_ids: inheritedPair!.map((item) => item.setting.voice_id),
          contribution_ids: contributed
        };
    }
    return local;
  }
  function selectRecommendation(pair: VoiceRecommendation[]) {
    if (readOnly) return;
    const local = materialize();
    if (!local) return;
    // An inherited legacy/default view has no pair identity but its active defaults must still be cleared.
    if (inherited && !local.dubbing?.recommendation)
      local.voices = local.voices.map((item) =>
        item.enabled ? { ...item, enabled: false } : item
      );
    const result = switchPoolRecommendation(
      local,
      pair.filter((item) => !locale || item.locale === locale),
      voices
    );
    if (result.profile.dubbing?.recommendation)
      result.profile.dubbing.recommendation.voice_ids = pair.map(
        (item) => item.setting.voice_id
      );
    setNotice(
      result.duplicates.length
        ? "推荐与已有音色重复，已保留现有局部参数，没有覆盖。"
        : pair.length
          ? "已采用推荐局部副本；仍须按宿主流程保存。"
          : "已取消推荐，原推荐声音保留为未选缓存；不会自动补声。"
    );
    onChange(result.profile);
  }
  function toggle(voice: VoiceOption) {
    if (readOnly) return;
    const local = materialize();
    if (local) onChange(togglePoolVoice(local, voice, voices));
  }
  function edit(setting: VoiceSetting) {
    if (readOnly) return;
    const local = materialize();
    if (!local) return;
    const selected =
      local.voices.find(
        (item) => voiceSettingKey(item) === voiceSettingKey(setting)
      ) ?? local.voices.find((item) => item.voice_id === setting.voice_id);
    const voice = voices.find((item) => item.id === setting.voice_id);
    if (!voice || !selected) return;
    const dialect =
      speechAccentGroup(voice.locale, voice.accent) === "uk"
        ? "en-GB"
        : "en-US";
    onOpenDetail(dialect);
    setDetail({
      setting: structuredClone(selected),
      profile: local,
      sourceKey,
      baseline: JSON.stringify(profile ?? null),
      dialect
    });
  }
  function preview(item: VoiceSetting, accent?: AudioAssetLocale) {
    const catalogVoice = voices.find((v) => v.id === item.voice_id);
    const voice =
      catalogVoice ??
      (item.audio_asset_id && item.locale
        ? {
            id: item.voice_id,
            label: item.version_name ?? item.voice_id,
            locale: item.locale,
            gender: "neutral" as const,
            styles: [],
            supportsRate: false,
            supportsPitch: false,
            isDefault: false
          }
        : undefined);
    if (!voice) return;
    const currentAccent = catalogVoice
      ? speechAccentGroup(catalogVoice.locale, catalogVoice.accent)
      : "other";
    const available = isVoiceRecommendationAvailable(
      {
        id: voiceSettingKey(item),
        name: "",
        groupName: "",
        locale: accent ?? (voice.locale as AudioAssetLocale),
        setting: effectiveVoiceSetting(item, voice)
      },
      voices,
      accent,
      content
    );
    return (
      <Button
        size="small"
        type="text"
        icon={<SoundOutlined />}
        data-accent={currentAccent ?? "other"}
        style={{
          color:
            currentAccent === "uk"
              ? "#2053FF"
              : currentAccent === "us"
                ? "#FC007A"
                : "#8c8c8c"
        }}
        aria-label={`试听 ${voice.displayName ?? voice.label}${!accent && item.version_name ? ` · ${item.version_name}` : ""}`}
        disabled={
          !canAudition ||
          !!(locale && accent && locale !== accent) ||
          (!item.audio_asset_id && !available)
        }
        onClick={() => onAudition(voice, item)}
      />
    );
  }
  function renderIdentity(setting: VoiceSetting, accent: AudioAssetLocale) {
    const voice = voices.find((item) => item.id === setting.voice_id);
    return (
      <>
        <span>{preview(setting, accent)}</span>
        <PoolVoiceName voice={voice} fallback={setting.voice_id} />
        <PoolVoiceRate setting={setting} />
        <PoolVoiceVolume setting={setting} />
      </>
    );
  }
  return (
    <section className="tsz-ve-local-pool" aria-label="局部配音音色池">
      <Space wrap>
        <Tag>
          {inherited
            ? "动态继承"
            : converted
              ? source
                ? "推荐局部副本"
                : "不选推荐 · 自定义池"
              : "历史独立配置"}
        </Tag>
        <Button disabled={readOnly} onClick={onRestore}>
          恢复默认推荐
        </Button>
      </Space>
      {(error || notice) && (
        <Alert
          type={error ? "warning" : "info"}
          title={error || notice}
          showIcon
        />
      )}
      {conflicts.length > 0 && (
        <section aria-label="历史音色冲突">
          <Alert
            type="warning"
            title="同一官方 ID 存在多个历史配置。原版本仍可播放；请明确保留配置后转换，旧发布快照不变。"
          />
          {conflicts.map(([id, items]) => (
            <div key={id}>
              <Typography.Text code>
                {voices.find((v) => v.id === items[0]!.voice_id)
                  ?.providerVoiceId ?? items[0]!.voice_id}
              </Typography.Text>
              <Radio.Group
                aria-label={`历史冲突 ${items[0]!.voice_id}`}
                value={choices[id]}
                onChange={(event) =>
                  setChoices((previous) => ({
                    ...previous,
                    [id]: event.target.value
                  }))
                }
              >
                {items.map((item) => (
                  <div key={voiceSettingKey(item)}>
                    <Radio value={voiceSettingKey(item)}>
                      {item.version_name ?? item.voice_id} ·{" "}
                      <PoolVoiceRate setting={item} /> ·{" "}
                      <PoolVoiceVolume setting={item} />
                      {item.enabled ? " 已选" : " 缓存"}
                    </Radio>
                    {preview(item)}
                  </div>
                ))}
              </Radio.Group>
            </div>
          ))}
          <Button
            disabled={
              readOnly ||
              conflicts.some(
                ([id, items]) =>
                  !items.some((item) => voiceSettingKey(item) === choices[id])
              )
            }
            onClick={() => {
              onChange(
                convertVoicePool(profile, current, voices, area, choices)
              );
              setNotice("已按明确选择转换局部草稿；仍须按宿主流程保存。");
            }}
          >
            按选择转换为新池
          </Button>
        </section>
      )}
      <Typography.Title level={5}>已获取的配音设置</Typography.Title>
      <Typography.Paragraph type="secondary">
        概率为本侧合格已选池的第 2 题起预览；正文或音色失效的项不参与计算。
      </Typography.Paragraph>
      <div className="tsz-ve-pool-scroll">
        <div className="tsz-ve-pool-sides">
          {sides
            .filter((side) => !locale || locale === side.locale)
            .map((side) => {
              const selected = current.filter((setting) => {
                const voice = voices.find((v) => v.id === setting.voice_id);
                return (
                  setting.enabled &&
                  speechAccentGroup(
                    voice?.locale ?? setting.locale,
                    voice?.accent
                  ) === side.key
                );
              });
              return (
                <section key={side.key} aria-label={`${side.label}已获取音色`}>
                  <Typography.Text
                    className="tsz-ve-pool-side-title"
                    data-accent={side.key}
                    strong
                  >
                    {side.label}
                  </Typography.Text>
                  <div className="tsz-ve-pool-row tsz-ve-pool-head">
                    <span>序号</span>
                    <span>概率</span>
                    <span>排序</span>
                    <span>试听</span>
                    <span>音色</span>
                    <span>语速</span>
                    <span>音量</span>
                    <span>修改</span>
                  </div>
                  {!selected.length && (
                    <Typography.Paragraph type="secondary">
                      尚无已选音色，请选择推荐或勾选目录。
                    </Typography.Paragraph>
                  )}
                  {selected.map((setting, rank) => {
                    const key = voiceSettingKey(setting);
                    const probability = probabilities.get(key);
                    return (
                      <div
                        key={key}
                        aria-label={`${side.label}池 ${setting.version_name ?? setting.voice_id}`}
                      >
                        <div className="tsz-ve-pool-row">
                          <span>{rank + 1}</span>
                          <span>
                            {probability === undefined
                              ? "—"
                              : `${(probability * 100).toFixed(1)}%`}
                          </span>
                          <Space size={0}>
                            {([-1, 1] as const).map((direction) => (
                              <Button
                                key={direction}
                                size="small"
                                type="text"
                                aria-label={`${direction === -1 ? "上移" : "下移"} ${setting.version_name ?? setting.voice_id}`}
                                icon={
                                  direction === -1 ? (
                                    <ArrowUpOutlined />
                                  ) : (
                                    <ArrowDownOutlined />
                                  )
                                }
                                disabled={
                                  readOnly ||
                                  (direction === -1
                                    ? rank === 0
                                    : rank === selected.length - 1)
                                }
                                onClick={() => {
                                  const local = materialize();
                                  if (local)
                                    onChange({
                                      ...local,
                                      voices: reorderPoolVoice(
                                        local.voices,
                                        key,
                                        direction,
                                        voices
                                      )
                                    });
                                }}
                              />
                            ))}
                          </Space>
                          {renderIdentity(setting, side.locale)}
                          <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            aria-label={`修改 ${setting.version_name ?? setting.voice_id}`}
                            disabled={
                              readOnly ||
                              !voices.some((v) => v.id === setting.voice_id)
                            }
                            onClick={() => edit(setting)}
                          />
                        </div>
                        {probability === undefined && (
                          <Typography.Text type="warning">
                            当前声音、参数或正文读法不可用，保留配置，不参与概率。
                          </Typography.Text>
                        )}
                        {!voices.some(
                          (voice) => voice.id === setting.voice_id
                        ) && (
                          <Button
                            size="small"
                            type="link"
                            disabled={readOnly}
                            onClick={() => {
                              const local = materialize();
                              if (local)
                                onChange({
                                  ...local,
                                  voices: local.voices.map((item) =>
                                    voiceSettingKey(item) === key
                                      ? { ...item, enabled: false }
                                      : item
                                  )
                                });
                            }}
                          >
                            取消选用 {setting.version_name ?? setting.voice_id}
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </section>
              );
            })}
        </div>
      </div>
      {current
        .filter((item) => {
          const voice = voices.find((v) => v.id === item.voice_id);
          return (
            item.enabled &&
            (!["uk", "us"].includes(
              speechAccentGroup(voice?.locale ?? item.locale, voice?.accent) ??
                ""
            ) ||
              !!(
                locale &&
                speechAccentGroup(
                  voice?.locale ?? item.locale,
                  voice?.accent
                ) !== speechAccentGroup(locale)
              ))
          );
        })
        .map((item) => (
          <div key={voiceSettingKey(item)}>
            <Alert
              type="warning"
              title={`${locale ? "音色归属与当前正文口音不符" : "音色口音未知"}：${item.version_name ?? item.voice_id}；原配置保留，不参与播放池。`}
            />
            {preview(item)}
            <Button
              disabled={readOnly}
              aria-label={`取消启用失效音色 ${item.voice_id}`}
              onClick={() =>
                onChange({
                  ...profile,
                  voices: current.map((setting) =>
                    voiceSettingKey(setting) === voiceSettingKey(item)
                      ? { ...setting, enabled: false }
                      : setting
                  )
                })
              }
            >
              取消启用失效音色 {item.voice_id}
            </Button>
          </div>
        ))}
      <Typography.Title level={5}>适用分组推荐</Typography.Title>
      <div className="tsz-ve-pool-scroll">
        <Radio.Group
          className="tsz-ve-pool-recommendations"
          aria-label="局部推荐"
          value={
            selectedPair
              ? `${selectedPair[0]!.groupId}/${selectedPair[0]!.pairId}`
              : !inherited && converted && !source
                ? "none"
                : undefined
          }
          onChange={(event) =>
            selectRecommendation(
              event.target.value === "none"
                ? []
                : (pairs.find(
                    (pair) =>
                      `${pair[0]!.groupId}/${pair[0]!.pairId}` ===
                      event.target.value
                  ) ?? [])
            )
          }
        >
          <Radio value="none" disabled={readOnly}>
            不选择推荐
          </Radio>
          <div className="tsz-ve-pool-pair tsz-ve-pool-head">
            <span>推荐／来源</span>
            {sides.map((side) => (
              <div key={side.key} className="tsz-ve-pool-pair-side">
                <span>试听</span>
                <span>{side.label}音色</span>
                <span>语速</span>
                <span>音量</span>
              </div>
            ))}
          </div>
          {pairs.map((pair) => (
            <div
              className="tsz-ve-pool-pair"
              key={`${pair[0]!.groupId}/${pair[0]!.pairId}`}
            >
              <Radio
                value={`${pair[0]!.groupId}/${pair[0]!.pairId}`}
                disabled={
                  readOnly ||
                  pair
                    .filter((item) => !locale || item.locale === locale)
                    .some(
                      (item) =>
                        !isVoiceRecommendationAvailable(
                          {
                            ...item,
                            setting: effectiveVoiceSetting(
                              item.setting,
                              voices.find((v) => v.id === item.setting.voice_id)
                            )
                          },
                          voices,
                          item.locale,
                          content
                        )
                    )
                }
              >
                <span>
                  {pair[0]!.name}
                  <small>
                    {pair[0]!.groupName}
                    {pair[0]!.selected === false ? "（组内未选）" : ""}
                  </small>
                </span>
              </Radio>
              {pair.map((item) => (
                <div className="tsz-ve-pool-pair-side" key={item.id}>
                  {renderIdentity(
                    {
                      ...item.setting,
                      version_name: item.name,
                      version_id: item.id
                    },
                    item.locale
                  )}
                </div>
              ))}
            </div>
          ))}
        </Radio.Group>
      </div>
      {recommendations.some((item) => !item.pairId) && (
        <section aria-label="历史未配对推荐">
          <Typography.Paragraph type="secondary">
            历史未配对分组仅保留默认解析；请在分组页明确整理后选用整套推荐。
          </Typography.Paragraph>
          <div className="tsz-ve-pool-scroll">
            <div className="tsz-ve-pool-recommendations">
              <div className="tsz-ve-pool-pair tsz-ve-pool-head">
                <span>历史单侧推荐／来源</span>
                <div className="tsz-ve-pool-pair-side">
                  <span>试听</span>
                  <span>音色</span>
                  <span>语速</span>
                  <span>音量</span>
                </div>
              </div>
              {recommendations
                .filter((item) => !item.pairId)
                .map((item) => (
                  <div className="tsz-ve-pool-pair" key={item.id}>
                    <span>
                      {item.name}
                      <small>
                        {item.groupName} ·{" "}
                        {item.locale === "en-GB" ? "英式" : "美式"} · 未配对
                        {item.selected === false ? " · 组内未选" : ""}
                      </small>
                    </span>
                    <div className="tsz-ve-pool-pair-side">
                      {renderIdentity(
                        {
                          ...item.setting,
                          version_name: item.name,
                          version_id: item.id
                        },
                        item.locale
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </section>
      )}
      {!pairs.length && !loading && (
        <Typography.Paragraph type="secondary">
          尚无适用的配对推荐，可直接从目录多选。
        </Typography.Paragraph>
      )}
      {source && !selectedPair && (
        <Typography.Paragraph type="secondary">
          来源推荐已变更或删除；已采用的局部副本仍保留。
        </Typography.Paragraph>
      )}
      <Typography.Title level={5}>完整音色目录</Typography.Title>
      {locale && (
        <Typography.Paragraph type="secondary">
          当前正文仅编辑{locale === "en-GB" ? "英式" : "美式"}
          局部池；另一侧目录和推荐供查看，不改变其正文与音频归属。
        </Typography.Paragraph>
      )}
      <Input.Search
        aria-label="搜索局部音色目录"
        placeholder="搜索音色名称或官方 ID"
        value={search}
        onChange={(event) => {
          if (!search && event.target.value)
            columns.current.forEach((list, key) =>
              unfilteredPositions.current.set(key, list.scrollTop)
            );
          columns.current.forEach((list, key) =>
            positions.current.set(key, list.scrollTop)
          );
          setSearch(event.target.value);
        }}
        allowClear
      />
      {loading && <Spin aria-label="正在加载音色目录" />}
      <div className="tsz-ve-pool-scroll">
        <div className="tsz-ve-pool-catalog">
          {sides.flatMap((side) =>
            ["female", "male"].map((gender) => {
              const key = `${side.key}-${gender}`;
              return (
                <section
                  key={key}
                  aria-label={`${side.label}${gender === "female" ? "女声" : "男声"}目录`}
                >
                  <Typography.Text
                    className="tsz-ve-pool-side-title"
                    data-accent={side.key}
                    strong
                  >
                    {side.label} · {gender === "female" ? "女声" : "男声"}
                  </Typography.Text>
                  <div
                    className="tsz-ve-pool-catalog-list"
                    ref={(element) => {
                      if (element) columns.current.set(key, element);
                      else columns.current.delete(key);
                    }}
                    onScroll={(event) =>
                      positions.current.set(key, event.currentTarget.scrollTop)
                    }
                  >
                    {voices
                      .filter(
                        (voice) =>
                          speechAccentGroup(voice.locale, voice.accent) ===
                            side.key &&
                          (voice.gender === gender ||
                            (gender === "male" && voice.gender === "neutral"))
                      )
                      .map((voice) => (
                        <div
                          key={voice.id}
                          hidden={
                            excluded.has(providerVoiceKey(voice.id, voices)) ||
                            !`${voice.displayName ?? voice.label} ${voice.providerVoiceId ?? voice.id}`
                              .toLowerCase()
                              .includes(search.toLowerCase())
                          }
                        >
                          <Checkbox
                            aria-label={`选用 ${voice.displayName ?? voice.label}`}
                            disabled={
                              readOnly || !!(locale && locale !== side.locale)
                            }
                            checked={current.some(
                              (setting) =>
                                setting.enabled &&
                                providerVoiceKey(setting.voice_id, voices) ===
                                  providerVoiceKey(voice.id, voices)
                            )}
                            onChange={() => toggle(voice)}
                          >
                            <PoolVoiceName voice={voice} fallback={voice.id} />
                          </Checkbox>
                          <Typography.Text
                            code
                            className="tsz-ve-pool-provider-id"
                            copyable
                          >
                            {voice.providerVoiceId ?? voice.id}
                          </Typography.Text>
                        </div>
                      ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
      </div>
      {detail &&
        detail.sourceKey === sourceKey &&
        detail.baseline === JSON.stringify(profile ?? null) &&
        voices.some((voice) => voice.id === detail.setting.voice_id) && (
          <VoiceDetail
            key={`${sourceKey}/${detail.dialect}/${voiceSettingKey(detail.setting)}`}
            setting={detail.setting}
            voice={voices.find((v) => v.id === detail.setting.voice_id)!}
            content={content}
            sourceKey={sourceKey}
            dialect={detail.dialect}
            profile={detail.profile}
            adapter={adapter}
            readOnly={readOnly}
            canAudition={canAudition}
            unavailable={unavailableVersions?.has(
              voiceSettingKey(detail.setting)
            )}
            previousAudio={previousAudio.filter(
              (item) =>
                voiceSettingKey(item) === voiceSettingKey(detail.setting)
            )}
            audioTools={(stopPlayback) =>
              audioTools(detail.dialect, stopPlayback)
            }
            pendingUpload={pendingUpload}
            stopExternalAudio={onCloseDetail}
            onCancel={() => {
              onCloseDetail();
              setDetail(undefined);
            }}
            onSave={(next) => {
              if (readOnly || detail.sourceKey !== sourceKey) return;
              const local = converted && !inherited ? profile! : detail.profile;
              onChange({
                ...local,
                voices: local.voices.map((item) =>
                  voiceSettingKey(item) === voiceSettingKey(next) ? next : item
                )
              });
              onCloseDetail();
              setDetail(undefined);
            }}
          />
        )}
    </section>
  );
}
