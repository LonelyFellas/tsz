import { speechAccentGroup } from "@tsz/shared";
import {
  CaretRightOutlined,
  FilterOutlined,
  SearchOutlined
} from "@ant-design/icons";
import type { AdminSpeechVoice, AdminVoiceLibraryItem } from "@tsz/types";
import {
  Button,
  Checkbox,
  Descriptions,
  Drawer,
  Form,
  Input,
  Pagination,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography
} from "antd";
import { useState } from "react";
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
function language(voice: AdminSpeechVoice) {
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

export function VoiceCatalogDetails({ voice }: { voice: AdminSpeechVoice }) {
  const info = voice.metadata;
  return (
    <section className="voice-library-details" aria-label="音色资料">
      <Typography.Title level={5}>音色资料</Typography.Title>
      <Descriptions
        size="small"
        column={1}
        items={[
          {
            key: "language",
            label: "语言／地区",
            children: `${language(voice)}／${region(voice)}（${voice.locale}）`
          },
          {
            key: "age",
            label: "年龄",
            children:
              ageNames[info?.age_group ?? ""] ?? info?.age_group ?? "未提供"
          },
          {
            key: "model",
            label: "模型",
            children: modelNames[info?.model ?? ""] ?? info?.model ?? "未提供"
          },
          {
            key: "personalities",
            label: "声音特征",
            children: list(info?.personalities, personalityNames)
          },
          {
            key: "scenarios",
            label: "推荐场景",
            children: list(info?.scenarios, scenarioNames)
          },
          {
            key: "styles",
            label: "可选风格",
            children: [
              "自然",
              ...voice.capabilities.styles.map(
                (value) => styleNames[value] ?? value
              )
            ].join("、")
          },
          { key: "roles", label: "可选角色", children: list(info?.roles) }
        ]}
      />
      <Typography.Paragraph className="voice-library-official-description">
        <Typography.Text type="secondary">官方原文</Typography.Text>
        <br />
        {info?.description || "未提供"}
      </Typography.Paragraph>
      {info?.source_url && (
        <Typography.Link
          href={info.source_url}
          target="_blank"
          rel="noreferrer"
        >
          官方资料（{info.checked_at.slice(0, 10)}）
        </Typography.Link>
      )}
    </section>
  );
}

interface Props {
  voices: AdminSpeechVoice[];
  metadata: Map<string, AdminVoiceLibraryItem>;
  loading: boolean;
  settingsPending: boolean;
  canGenerate: boolean;
  validText: boolean;
  activeVoice?: string;
  pendingVoice: string | null;
  onAudition: (voice: AdminSpeechVoice) => void;
  onSettings: (voice: AdminSpeechVoice) => void;
}

type FilterKey =
  | "language"
  | "region"
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
      return [info?.model ?? missing];
    case "style":
      return ["neutral", ...voice.capabilities.styles];
    case "role":
      return info?.roles == null
        ? [missing]
        : info.roles.length
          ? info.roles
          : [none];
  }
};

export function VoiceCatalogTable({
  voices,
  metadata,
  loading,
  settingsPending,
  canGenerate,
  validText,
  activeVoice,
  pendingVoice,
  onAudition,
  onSettings
}: Props) {
  const [query, setQuery] = useState("");
  const [commonOnly, setCommonOnly] = useState(false);
  const [sort, setSort] = useState("recommended");
  const [filters, setFilters] = useState<Filters>({});
  const [moreFilters, setMoreFilters] = useState(false);
  const [detailsVoice, setDetailsVoice] = useState<AdminSpeechVoice | null>(
    null
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const rows = (() => {
    const search = query.trim().toLowerCase();
    return voices
      .filter((voice) => {
        const info = metadata.get(voice.alias);
        return (
          (!search ||
            [
              voice.display_name,
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
  const hasFilters =
    !!query ||
    commonOnly ||
    Object.values(filters).some((value) => value.length) ||
    sort !== "recommended";
  const advancedCount = ["scenario", "model", "style", "role"].reduce(
    (count, key) => count + (filters[key as FilterKey]?.length ?? 0),
    0
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(rows.length / pageSize))
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
      .map((value) => ({
        value,
        label:
          value === missing
            ? "未提供"
            : value === none
              ? "无"
              : (labels[value] ?? value)
      }));
  }
  function filter(
    key: FilterKey,
    label: string,
    labels?: Record<string, string>
  ) {
    return (
      <Form.Item label={label}>
        <Select
          mode="multiple"
          aria-label={label}
          placeholder="全部"
          allowClear
          maxTagCount="responsive"
          value={filters[key] ?? []}
          options={options(key, labels)}
          onChange={(value) => {
            setFilters((old) => ({ ...old, [key]: value }));
            setPage(1);
          }}
        />
      </Form.Item>
    );
  }
  return (
    <section className="voice-catalog" aria-label="音色库">
      <Form layout="vertical" className="voice-catalog-filters">
        <div className="voice-catalog-search">
          <Input
            type="search"
            prefix={<SearchOutlined />}
            aria-label="搜索音色"
            placeholder="搜索名称、介绍或听感"
            value={query}
            allowClear
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
          <Checkbox
            checked={commonOnly}
            onChange={(event) => {
              setCommonOnly(event.target.checked);
              setPage(1);
            }}
          >
            只看常用
          </Checkbox>
        </div>
        <div className="voice-catalog-filter-grid">
          {filter("language", "语言")}
          {filter("region", "口音／地区")}
          {filter("gender", "性别", genderNames)}
          {filter("age", "年龄组", ageNames)}
          <Button
            icon={<FilterOutlined aria-hidden />}
            aria-expanded={moreFilters}
            aria-controls="voice-catalog-more-filters"
            onClick={() => setMoreFilters(!moreFilters)}
          >
            更多筛选{advancedCount ? `（${advancedCount}）` : ""}
          </Button>
        </div>
        <div id="voice-catalog-more-filters" hidden={!moreFilters}>
          <div className="voice-catalog-advanced-grid">
            {filter("scenario", "推荐场景")}
            {filter("model", "模型", modelNames)}
            {filter("style", "可选风格", { ...styleNames, neutral: "自然" })}
            {filter("role", "可选角色")}
          </div>
        </div>
      </Form>
      <div className="voice-catalog-toolbar">
        <Space size={12} wrap>
          <Typography.Text strong>音色列表</Typography.Text>
          <Typography.Text type="secondary">
            {hasFilters
              ? `${rows.length} / ${voices.length} 个音色`
              : `共 ${voices.length} 个音色`}
          </Typography.Text>
          {hasFilters && (
            <Button type="link" size="small" onClick={reset}>
              清除筛选
            </Button>
          )}
        </Space>
        <Select
          aria-label="音色排序"
          variant="borderless"
          className="voice-catalog-sort"
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
      {voices.some((voice) => !voice.metadata) && (
        <Typography.Paragraph type="secondary" className="voice-catalog-notice">
          部分音色暂无详细资料，仍可试听。
        </Typography.Paragraph>
      )}
      <Spin spinning={loading}>
        {rows.length ? (
          <ul className="voice-catalog-list" aria-label="音色列表">
            {rows
              .slice((currentPage - 1) * pageSize, currentPage * pageSize)
              .map((voice) => {
                const info = metadata.get(voice.alias);
                const active = voice.alias === activeVoice;
                return (
                  <li
                    key={voice.alias}
                    className={`voice-catalog-item${active ? " voice-catalog-item-active" : ""}`}
                  >
                    <GatedButton
                      className="voice-catalog-play"
                      shape="circle"
                      color={
                        speechAccentGroup(voice.locale) === "uk"
                          ? "danger"
                          : speechAccentGroup(voice.locale) === "us"
                            ? "primary"
                            : "default"
                      }
                      variant={active ? "solid" : "outlined"}
                      icon={<CaretRightOutlined />}
                      aria-label={`试听 ${voice.display_name}`}
                      disabled={!canGenerate || !validText || settingsPending}
                      reason={
                        !canGenerate
                          ? "需要词库查看和语音生成权限"
                          : settingsPending
                            ? "正在加载个人音色设置"
                            : "请输入 1–500 个字符的试听文本"
                      }
                      loading={pendingVoice === voice.alias}
                      onClick={() => onAudition(voice)}
                    />
                    <div className="voice-catalog-identity">
                      <Space size={8} wrap>
                        <Tooltip
                          title={
                            voice.metadata?.provider_voice_id ?? voice.alias
                          }
                        >
                          <Typography.Text
                            strong
                            className="voice-catalog-name"
                          >
                            {voice.display_name}
                          </Typography.Text>
                        </Tooltip>
                        {voice.is_common && (
                          <Tag color="blue" variant="filled">
                            常用
                          </Tag>
                        )}
                      </Space>
                      <div className="voice-catalog-attributes">
                        <span>{language(voice)}</span>
                        <span>{region(voice)}</span>
                        <span>
                          {genderNames[voice.gender.toLowerCase()] ??
                            "性别未提供"}
                        </span>
                        <span>
                          {ageNames[voice.metadata?.age_group ?? ""] ??
                            voice.metadata?.age_group ??
                            "年龄未提供"}
                        </span>
                      </div>
                    </div>
                    <div className="voice-catalog-summary">
                      <p>
                        {info?.description_zh ||
                          voice.metadata?.description ||
                          "暂无介绍，可试听了解声音。"}
                      </p>
                      <div className="voice-catalog-characteristics">
                        {!!voice.metadata?.personalities?.length && (
                          <span>
                            {list(
                              voice.metadata.personalities,
                              personalityNames
                            )}
                          </span>
                        )}
                        {!!info?.notes && (
                          <span className="voice-catalog-notes">
                            我的听感：{info.notes}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="voice-catalog-settings">
                      <Button
                        type="text"
                        aria-label={`查看 ${voice.display_name} 资料`}
                        onClick={() => setDetailsVoice(voice)}
                      >
                        查看资料
                      </Button>
                      <Button
                        type="text"
                        aria-label={`调整 ${voice.display_name} 参数`}
                        disabled={settingsPending}
                        onClick={() => onSettings(voice)}
                      >
                        设置
                      </Button>
                    </div>
                  </li>
                );
              })}
          </ul>
        ) : (
          <TableEmptyState
            filtered={hasFilters && !!voices.length}
            onResetFilters={reset}
            message="暂无可用音色，请联系管理员检查语音服务配置。"
          />
        )}
      </Spin>
      <Drawer
        title={
          detailsVoice ? `${detailsVoice.display_name} 音色资料` : "音色资料"
        }
        open={!!detailsVoice}
        onClose={() => setDetailsVoice(null)}
        size={520}
        destroyOnHidden
      >
        {detailsVoice && (
          <>
            <VoiceCatalogDetails voice={detailsVoice} />
            {metadata.get(detailsVoice.alias)?.description_zh && (
              <section aria-label="共享介绍">
                <Typography.Title level={5}>共享介绍</Typography.Title>
                <Typography.Paragraph
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {metadata.get(detailsVoice.alias)?.description_zh}
                </Typography.Paragraph>
              </section>
            )}
            {metadata.get(detailsVoice.alias)?.notes && (
              <section aria-label="我的听感">
                <Typography.Title level={5}>我的听感</Typography.Title>
                <Typography.Paragraph
                  style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}
                >
                  {metadata.get(detailsVoice.alias)?.notes}
                </Typography.Paragraph>
              </section>
            )}
          </>
        )}
      </Drawer>
      {!!rows.length && (
        <Pagination
          className="voice-catalog-pagination"
          current={currentPage}
          pageSize={pageSize}
          total={rows.length}
          onChange={(next, size) => {
            setPage(size === pageSize ? next : 1);
            setPageSize(size);
          }}
          showSizeChanger
          pageSizeOptions={[10, 20, 50]}
          showTotal={(total) => `共 ${total} 个音色`}
        />
      )}
    </section>
  );
}
