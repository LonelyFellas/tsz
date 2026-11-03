import { VoiceName } from "./VoiceDisplay";
import {
  VoiceMetadataEditor,
  type MetadataEditorState
} from "./VoiceMetadataEditor";
import { speechAccentGroup } from "@tsz/shared";
import {
  SoundOutlined,
  FilterOutlined,
  ManOutlined,
  SearchOutlined,
  WomanOutlined
} from "@ant-design/icons";
import type { AdminSpeechVoice, AdminVoiceLibraryItem } from "@tsz/types";
import {
  Button,
  Checkbox,
  Input,
  Pagination,
  Popover,
  Select,
  Space,
  Table,
  Tag,
  Tooltip
} from "antd";
import { useState, type ReactNode } from "react";
import { GatedButton } from "@/components/GatedButton";
import { TableEmptyState } from "@/components/TableEmptyState";
import { personalityNames, scenarioNames, styleNames } from "./voice-labels";

export const modelNames: Record<string, string> = {
  hd_flash: "HD Flash · 普通高清",
  neural_hd: "Neural HD",
  multilingual: "Multilingual",
  neural: "Neural",
  hd_omni: "HD Omni"
};
const genderNames: Record<string, string> = {
  female: "女声",
  male: "男声",
  neutral: "中性"
};
const genderIcons: Record<string, ReactNode> = {
  male: <ManOutlined aria-hidden className="voice-catalog-gender-male" />,
  female: <WomanOutlined aria-hidden className="voice-catalog-gender-female" />,
  neutral: (
    <span aria-hidden className="voice-catalog-gender-neutral">
      ⚲
    </span>
  )
};
const ageNames: Record<string, string> = {
  Child: "儿童",
  Teen: "青少年",
  YoungAdult: "青年",
  Adult: "成年",
  Senior: "老年"
};
const ageOrder = Object.keys(ageNames);
const missing = "__missing__";
const none = "__none__";
const languages = new Intl.DisplayNames(["zh-CN"], { type: "language" });
const regions = new Intl.DisplayNames(["zh-CN"], { type: "region" });
const englishLanguages = new Intl.DisplayNames(["en"], { type: "language" });
export const accentNames = { gb: "英式", us: "美式", none: "不归类" };
export function voiceAccent(voice: AdminSpeechVoice) {
  const group = speechAccentGroup(voice.locale, voice.accent);
  return group === "uk" ? "gb" : group === "us" ? "us" : "none";
}
export function language(voice: AdminSpeechVoice) {
  return languages.of(voice.locale.split("-")[0]!) ?? voice.locale;
}
function region(voice: AdminSpeechVoice) {
  const code = new Intl.Locale(voice.locale).region;
  return code ? (regions.of(code) ?? code) : "未提供";
}
function list(
  values: string[] | null | undefined,
  labels: Record<string, string> = {}
) {
  return values?.length
    ? [
        ...new Set(values.map((value) => labels[value.toLowerCase()] ?? value))
      ].join("、")
    : values
      ? "无"
      : "未提供";
}

function preview(text: string) {
  return (
    <Tooltip title={text}>
      <span className="voice-catalog-cell-preview">{text}</span>
    </Tooltip>
  );
}

interface Props {
  canEditMetadata?: boolean;
  metadataEditing?: boolean;
  onMetadataEditorChange?: (
    id: string,
    state: MetadataEditorState | null
  ) => void;
  voices: AdminSpeechVoice[];
  metadata: Map<string, AdminVoiceLibraryItem>;
  loading: boolean;
  settingsPending: boolean;
  canGenerate: boolean;
  isVoiceTextValid?: (voice: AdminSpeechVoice) => boolean;
  trialVoiceAliases?: ReadonlySet<string>;
  validText: boolean;
  activeVoice?: string;
  pendingVoice: string | null;
  onAudition: (voice: AdminSpeechVoice) => void;
  onDetails: (voice: AdminSpeechVoice) => void;
}

type FilterKey =
  | "language"
  | "region"
  | "accent"
  | "gender"
  | "age"
  | "scenario"
  | "model"
  | "style"
  | "role";
type Filters = Partial<Record<FilterKey, string[]>>;

const filterValues = (voice: AdminSpeechVoice, key: FilterKey): string[] => {
  const info = voice.metadata;
  switch (key) {
    case "language":
      return [language(voice)];
    case "region":
      return [region(voice)];
    case "accent":
      return [voiceAccent(voice)];
    case "gender":
      return [voice.gender.toLowerCase() || missing];
    case "age":
      return [info?.age_group ?? missing];
    case "scenario":
      return info?.scenarios == null
        ? [missing]
        : info.scenarios.length
          ? [
              ...new Set(
                info.scenarios.map(
                  (value) => scenarioNames[value.toLowerCase()] ?? value
                )
              )
            ]
          : [none];
    case "model":
      return [info?.model ?? voice.capability_evidence?.model ?? missing];
    case "style":
      return ["neutral", ...voice.capabilities.styles];
    case "role": {
      const roles = voice.capability_evidence
        ? voice.capability_evidence.roles
        : info?.roles;
      return roles == null ? [missing] : roles.length ? roles : [none];
    }
  }
};

export function VoiceCatalogTable({
  canEditMetadata = false,
  metadataEditing = false,
  onMetadataEditorChange,
  voices,
  metadata,
  loading,
  settingsPending,
  canGenerate,
  isVoiceTextValid,
  trialVoiceAliases,
  validText,
  activeVoice,
  pendingVoice,
  onAudition,
  onDetails
}: Props) {
  const [query, setQuery] = useState("");
  const [commonOnly, setCommonOnly] = useState(false);
  const [sort, setSort] = useState("recommended");
  const [filters, setFilters] = useState<Filters>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editingRows, setEditingRows] = useState<AdminSpeechVoice[] | null>(
    null
  );
  const rows = (() => {
    const search = query.trim().toLowerCase();
    return voices
      .filter((voice) => {
        const info = metadata.get(voice.alias);
        return (
          (!search ||
            [
              voice.display_name,
              language(voice),
              voice.locale,
              englishLanguages.of(voice.locale.split("-")[0]!),
              new Intl.DisplayNames([voice.locale], { type: "language" }).of(
                voice.locale.split("-")[0]!
              ),
              region(voice),
              accentNames[voiceAccent(voice)],
              voice.alias,
              voice.metadata?.provider_voice_id,
              info?.description_zh,
              info?.notes,
              voice.metadata?.description,
              ...(voice.metadata?.personalities ?? []),
              list(voice.metadata?.personalities, personalityNames)
            ]
              .join(" ")
              .toLowerCase()
              .includes(search)) &&
          (!commonOnly || voice.is_common) &&
          (Object.entries(filters) as [FilterKey, string[]][]).every(
            ([key, selected]) =>
              !selected.length ||
              filterValues(voice, key).some((value) => selected.includes(value))
          )
        );
      })
      .sort((a, b) => {
        if (sort.startsWith("age")) {
          const aAge = ageOrder.indexOf(a.metadata?.age_group ?? "");
          const bAge = ageOrder.indexOf(b.metadata?.age_group ?? "");
          if (aAge === -1 || bAge === -1) {
            if (aAge !== bAge) return aAge === -1 ? 1 : -1;
          } else if (aAge !== bAge)
            return (sort === "age-desc" ? -1 : 1) * (aAge - bAge);
        }
        if (sort === "recommended" && a.is_common !== b.is_common)
          return Number(b.is_common) - Number(a.is_common);
        const order = a.display_name.localeCompare(b.display_name, "en", {
          numeric: true
        });
        return (
          (sort === "name-desc" ? -order : order) ||
          a.alias.localeCompare(b.alias)
        );
      });
  })();
  // 编辑期间固定结果集与顺序，避免异步资料更新卸载未保存的行内草稿。
  if (metadataEditing && editingRows === null) setEditingRows(rows);
  if (!metadataEditing && editingRows !== null) setEditingRows(null);
  const latestVoices = new Map(voices.map((voice) => [voice.alias, voice]));
  const displayedRows =
    metadataEditing && editingRows
      ? editingRows.map((voice) => latestVoices.get(voice.alias) ?? voice)
      : rows;
  const hasFilters =
    !!query ||
    commonOnly ||
    Object.values(filters).some((value) => value.length) ||
    sort !== "recommended";
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(displayedRows.length / pageSize))
  );
  function reset() {
    setQuery("");
    setCommonOnly(false);
    setFilters({});
    setSort("recommended");
    setPage(1);
  }
  function options(key: FilterKey, labels: Record<string, string> = {}) {
    return [...new Set(voices.flatMap((voice) => filterValues(voice, key)))]
      .sort()
      .map((value) => {
        const label =
          value === missing
            ? "未提供"
            : value === none
              ? "无"
              : (labels[value] ?? value);
        return {
          value,
          searchText: label,
          label:
            key === "gender" ? (
              <Space size={6}>
                {genderIcons[value]}
                {label}
              </Space>
            ) : (
              label
            )
        };
      });
  }
  function filter(
    key: FilterKey,
    label: string,
    labels?: Record<string, string>
  ) {
    const single = key === "style" || key === "role";
    return (
      <div className="voice-catalog-heading">
        <span>{label}</span>
        <Select
          mode={single ? undefined : "multiple"}
          disabled={metadataEditing}
          aria-label={label}
          placeholder="全部"
          allowClear
          showSearch
          maxTagCount="responsive"
          value={single ? filters[key]?.[0] : (filters[key] ?? [])}
          options={options(key, labels)}
          optionFilterProp="searchText"
          onChange={(value) => {
            setFilters((old) => ({
              ...old,
              [key]: typeof value === "string" ? [value] : (value ?? [])
            }));
            setPage(1);
          }}
        />
      </div>
    );
  }
  return (
    <section className="voice-catalog" aria-label="音色库">
      <Table<AdminSpeechVoice>
        className="voice-catalog-table"
        aria-label="音色列表"
        rowKey="alias"
        size="small"
        tableLayout="fixed"
        scroll={{ x: 1900 }}
        loading={loading}
        pagination={false}
        dataSource={displayedRows.slice(
          (currentPage - 1) * pageSize,
          currentPage * pageSize
        )}
        rowClassName={(voice) =>
          voice.alias === activeVoice ? "voice-catalog-row-active" : ""
        }
        locale={{
          emptyText: (
            <TableEmptyState
              filtered={hasFilters && !!voices.length}
              onResetFilters={reset}
              message="暂无可用音色，请联系管理员检查语音服务配置。"
            />
          )
        }}
        columns={[
          {
            key: "actions",
            title: (
              <div className="voice-catalog-heading">
                <span>操作</span>
                {hasFilters && (
                  <Button
                    className="voice-catalog-reset"
                    type="link"
                    size="small"
                    disabled={metadataEditing}
                    onClick={reset}
                  >
                    清除筛选
                  </Button>
                )}
              </div>
            ),
            width: 112,
            fixed: "left",
            render: (_, voice) => (
              <Space size={4} className="voice-catalog-actions">
                <GatedButton
                  className="voice-catalog-play"
                  shape="circle"
                  classNames={{ root: `voice-accent-${voiceAccent(voice)}` }}
                  color="default"
                  variant={voice.alias === activeVoice ? "solid" : "outlined"}
                  icon={<SoundOutlined />}
                  aria-label={`试听 ${voice.display_name}`}
                  disabled={
                    !canGenerate ||
                    !(isVoiceTextValid?.(voice) ?? validText) ||
                    settingsPending ||
                    voice.synthesis_available === false
                  }
                  reason={
                    voice.synthesis_available === false
                      ? "当前音色或语种尚未开放合成，能力需验证"
                      : !canGenerate
                        ? "需要词库查看和语音生成权限"
                        : settingsPending
                          ? "正在加载个人音色设置"
                          : "请输入 1–500 个字符的试听文本"
                  }
                  loading={pendingVoice === voice.alias}
                  onClick={() => onAudition(voice)}
                />
                <Button
                  size="small"
                  aria-label={`调节 ${voice.display_name} 声音`}
                  disabled={settingsPending}
                  onClick={() => onDetails(voice)}
                >
                  调节
                </Button>
              </Space>
            )
          },
          {
            key: "voice",
            title: (
              <div className="voice-catalog-heading">
                <div className="voice-catalog-heading-label">
                  <span>音色</span>
                  <Popover
                    trigger="click"
                    placement="bottomLeft"
                    content={
                      <div className="voice-catalog-controls">
                        <Checkbox
                          checked={commonOnly}
                          disabled={metadataEditing}
                          onChange={(event) => {
                            setCommonOnly(event.target.checked);
                            setPage(1);
                          }}
                        >
                          只看常用
                        </Checkbox>
                        <Select
                          aria-label="音色排序"
                          disabled={metadataEditing}
                          value={sort}
                          options={[
                            { value: "recommended", label: "常用优先" },
                            { value: "name-asc", label: "名称升序" },
                            { value: "name-desc", label: "名称倒序" },
                            { value: "age-asc", label: "年龄升序" },
                            { value: "age-desc", label: "年龄倒序" }
                          ]}
                          onChange={(value) => {
                            setSort(value);
                            setPage(1);
                          }}
                        />
                      </div>
                    }
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<FilterOutlined />}
                      aria-label="音色筛选和排序"
                    />
                  </Popover>
                </div>
                <Input
                  type="search"
                  prefix={<SearchOutlined />}
                  aria-label="搜索音色"
                  disabled={metadataEditing}
                  placeholder="搜索名称、介绍或听感"
                  value={query}
                  allowClear
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                />
              </div>
            ),
            width: 184,
            fixed: "left",
            render: (_, voice) => (
              <div className="voice-catalog-identity">
                <Tooltip
                  title={voice.metadata?.provider_voice_id ?? voice.alias}
                >
                  <span className="voice-catalog-name">
                    <VoiceName voice={voice} />
                  </span>
                </Tooltip>
                <Space size={4} wrap>
                  {voice.is_common && (
                    <Tag color="blue" variant="filled">
                      常用
                    </Tag>
                  )}
                  {trialVoiceAliases?.has(voice.alias) && (
                    <Tooltip title="已保留该音色本次页面的试听草稿">
                      <Tag>本次试听</Tag>
                    </Tooltip>
                  )}
                </Space>
              </div>
            )
          },
          {
            key: "language",
            title: filter("language", "语言"),
            width: 112,
            render: (_, voice) => language(voice)
          },
          {
            key: "region",
            title: filter("region", "官方地区"),
            width: 128,
            render: (_, voice) => region(voice)
          },
          {
            key: "accent",
            title: filter("accent", "口音归属", accentNames),
            width: 112,
            render: (_, voice) => {
              const content = (
                <Space size={6}>
                  <span
                    className={`voice-accent-dot voice-accent-${voiceAccent(voice)}`}
                    aria-hidden
                  />
                  {accentNames[voiceAccent(voice)]}
                </Space>
              );
              return canEditMetadata ? (
                <VoiceMetadataEditor
                  voice={voice}
                  item={metadata.get(voice.alias)}
                  field="accent"
                  disabled={settingsPending}
                  onStateChange={onMetadataEditorChange}
                >
                  {content}
                </VoiceMetadataEditor>
              ) : (
                content
              );
            }
          },
          {
            key: "gender",
            title: filter("gender", "性别", genderNames),
            width: 100,
            render: (_, voice) => (
              <Space size={4}>
                {genderIcons[voice.gender.toLowerCase()]}
                {genderNames[voice.gender.toLowerCase()] ?? "性别未提供"}
              </Space>
            )
          },
          {
            key: "age",
            title: filter("age", "年龄组", ageNames),
            width: 112,
            render: (_, voice) =>
              ageNames[voice.metadata?.age_group ?? ""] ??
              voice.metadata?.age_group ??
              "年龄未提供"
          },
          {
            key: "description",
            title: "介绍",
            width: 300,
            render: (_, voice) => {
              const info = metadata.get(voice.alias);
              const description =
                info?.description_zh ??
                voice.metadata?.description ??
                "暂无介绍，可试听了解声音。";
              return (
                <div className="voice-catalog-summary">
                  {!!voice.metadata?.personalities?.length && (
                    <div className="voice-catalog-tags">
                      {voice.metadata.personalities.map((value) => (
                        <Tag key={value}>
                          {personalityNames[value.toLowerCase()] ?? value}
                        </Tag>
                      ))}
                    </div>
                  )}
                  {canEditMetadata ? (
                    <VoiceMetadataEditor
                      voice={voice}
                      item={info}
                      field="description"
                      disabled={settingsPending}
                      onStateChange={onMetadataEditorChange}
                    >
                      {preview(description || "介绍已清空")}
                    </VoiceMetadataEditor>
                  ) : (
                    preview(description || "介绍已清空")
                  )}
                  {!!info?.notes && (
                    <p className="voice-catalog-notes">
                      {preview(`我的听感：${info.notes}`)}
                    </p>
                  )}
                </div>
              );
            }
          },
          {
            key: "scenario",
            title: filter("scenario", "推荐场景"),
            width: 160,
            render: (_, voice) =>
              preview(list(voice.metadata?.scenarios, scenarioNames))
          },
          {
            key: "model",
            title: filter("model", "模型", modelNames),
            width: 160,
            render: (_, voice) => {
              const model =
                voice.metadata?.model ?? voice.capability_evidence?.model;
              return model ? (modelNames[model] ?? model) : "未提供";
            }
          },
          {
            key: "style",
            title: filter("style", "可选风格", {
              ...styleNames,
              neutral: "默认"
            }),
            width: 160,
            render: (_, voice) =>
              preview(
                list(["neutral", ...voice.capabilities.styles], {
                  ...styleNames,
                  neutral: "默认"
                })
              )
          },
          {
            key: "role",
            title: filter("role", "可选角色"),
            width: 160,
            render: (_, voice) =>
              preview(
                list(
                  voice.capability_evidence
                    ? voice.capability_evidence.roles
                    : voice.metadata?.roles
                )
              )
          }
        ]}
      />
      {!!displayedRows.length && (
        <div className="voice-catalog-footer">
          <Pagination
            disabled={metadataEditing}
            className="voice-catalog-pagination"
            current={currentPage}
            pageSize={pageSize}
            total={displayedRows.length}
            onChange={(next, size) => {
              setPage(size === pageSize ? next : 1);
              setPageSize(size);
            }}
            showSizeChanger
            pageSizeOptions={[10, 20, 50]}
            showTotal={(total) => `共 ${total} 个音色`}
          />
        </div>
      )}
    </section>
  );
}
