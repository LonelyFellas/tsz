import { CheckOutlined, SoundOutlined } from "@ant-design/icons";
import {
  Button,
  ColorPicker,
  Input,
  Popconfirm,
  Popover,
  Space,
  Progress,
  Radio,
  Spin,
  Typography
} from "antd";
import type { ReactNode } from "react";
import { Fragment, useRef, useState } from "react";
import { setLiaisonColor, useLiaisonColor } from "../../marks";
import type {
  AudioAsset,
  AudioAssetGender,
  AudioAssetLocale,
  VoiceOption,
  VoiceSetting
} from "../../types";
import {
  AUDIO_UPLOAD_ACCEPT,
  AUDIO_UPLOAD_HINT,
  progressPercent,
  type PendingUpload
} from "./audioAssets";
import {
  GRAMMAR_ROLES,
  LIAISON_ANCHORS,
  PAUSE_PRESETS,
  RATE_PRESETS,
  RATE_MULTIPLIER_MIN,
  RATE_MULTIPLIER_MAX,
  VOICE_GENDERS,
  VOICE_LOCALES,
  formatPauseLabel,
  voiceShortName
} from "./roles";
import type { Brush, LiaisonEnd } from "./roles";
import { anchorLetters } from "./tokens";
import type { LiaisonAnchor, LiaisonDraft } from "./tokens";

/** 工具栏中的发音、标注和音频面板。 */

/** 下拉面板里的一行：左勾选位 + 名称 + 右侧附注，可选带一个尾部按钮。 */
function PopRow({
  selected,
  label,
  meta,
  ariaLabel,
  disabled,
  onToggle,
  trailing
}: {
  selected: boolean;
  label: ReactNode;
  meta?: ReactNode;
  ariaLabel: string;
  disabled?: boolean;
  onToggle: () => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="tsz-ve-pop-row" data-selected={selected || undefined}>
      <button
        type="button"
        className="tsz-ve-pop-hit"
        role="checkbox"
        aria-checked={selected}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={onToggle}
      >
        {/* 勾选位始终占宽，勾上勾下时行内其余文字不会左右跳。 */}
        <span className="tsz-ve-pop-check" aria-hidden>
          <CheckOutlined />
        </span>
        <span className="tsz-ve-pop-name">{label}</span>
        {meta !== undefined && <span className="tsz-ve-pop-meta">{meta}</span>}
      </button>
      {trailing}
    </div>
  );
}

function PopSection({
  title,
  locale,
  children
}: {
  title: string;
  locale?: string;
  children: ReactNode;
}) {
  return (
    <div className="tsz-ve-pop-section" data-locale={locale}>
      <div className="tsz-ve-pop-section-head">{title}</div>
      {children}
    </div>
  );
}

export interface VoicePanelProps {
  readOnly?: boolean;
  /** 只保留这一侧的语种分组；不传表示这段正文不分英美，全部照常展示。 */
  locale?: AudioAssetLocale;
  voices: VoiceOption[];
  voicesLoading: boolean;
  enabledVoiceIds: string[];
  voiceSettings?: readonly VoiceSetting[];
  onRateChange?: (voiceId: string, ratePercent: number) => void;
  onToggleVoice: (voiceId: string) => void;
  pendingVoiceId?: string;
  playingVoiceId?: string;
  canAudition: boolean;
  onAudition: (voice: VoiceOption) => void;
  auditionStatus: string;
}

/** 音色：按语种分组的可勾选清单，每行右侧一个试听。 */
export function VoicePanel({
  readOnly,
  locale,
  voices,
  voicesLoading,
  enabledVoiceIds,
  voiceSettings,
  onRateChange,
  onToggleVoice,
  pendingVoiceId,
  playingVoiceId,
  canAudition,
  onAudition,
  auditionStatus
}: VoicePanelProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const common = voices.filter((voice) => voice.isCommon !== false);
  const uncommon = voices.filter((voice) => voice.isCommon === false);
  const selectedUncommon = uncommon.filter((voice) =>
    enabledVoiceIds.includes(voice.id)
  ).length;
  // 已勾选却不属于本侧的音色仍要露出来，否则历史配置只能看见结果、没法取消。
  const visibleLocales = (items: VoiceOption[]) =>
    locale
      ? VOICE_LOCALES.filter(
          (entry) =>
            entry.locale === locale ||
            items.some(
              (voice) =>
                voice.locale === entry.locale &&
                enabledVoiceIds.includes(voice.id)
            )
        )
      : VOICE_LOCALES;
  const renderGroups = (items: VoiceOption[]) =>
    visibleLocales(items).map(({ locale, badge }) => {
      const group = items.filter((voice) => voice.locale === locale);
      if (group.length === 0) return null;
      return (
        <PopSection key={locale} title={badge} locale={locale}>
          <div className="tsz-ve-voice-columns">
            {[
              ...VOICE_GENDERS,
              ...(group.some((voice) => voice.gender === "neutral")
                ? [{ gender: "neutral" as const, label: "其他" }]
                : [])
            ].map(({ gender, label }) => (
              <div
                key={gender}
                className="tsz-ve-voice-column"
                aria-label={`${badge} ${label}`}
              >
                <div className="tsz-ve-voice-column-title">{label}</div>
                {group
                  .filter((voice) => voice.gender === gender)
                  .map((voice) => (
                    <PopRow
                      key={voice.id}
                      selected={enabledVoiceIds.includes(voice.id)}
                      label={voiceShortName(voice)}
                      ariaLabel={`启用 ${voice.label}`}
                      disabled={readOnly}
                      onToggle={() => onToggleVoice(voice.id)}
                      trailing={
                        <Space size={2}>
                          {onRateChange && (
                            <VoiceRateControl
                              voice={voice}
                              ratePercent={
                                voiceSettings?.find(
                                  (setting) => setting.voice_id === voice.id
                                )?.rate_percent ?? 0
                              }
                              readOnly={readOnly}
                              onChange={(ratePercent) =>
                                onRateChange(voice.id, ratePercent)
                              }
                            />
                          )}
                          <Button
                            size="small"
                            type="text"
                            className="tsz-ve-audition-button"
                            aria-label={`试听 ${voice.label}`}
                            loading={pendingVoiceId === voice.id}
                            disabled={!canAudition}
                            data-playing={playingVoiceId === voice.id}
                            onClick={() => onAudition(voice)}
                          >
                            <SoundOutlined />
                          </Button>
                        </Space>
                      }
                    />
                  ))}
              </div>
            ))}
          </div>
        </PopSection>
      );
    });
  return (
    <div className="tsz-ve-pop tsz-ve-pop-voices" aria-label="音色清单">
      {voicesLoading ? (
        <div className="tsz-ve-pop-loading">
          <Spin size="small" aria-label="正在加载音色" />
        </div>
      ) : (
        <>
          {renderGroups(common)}
          {uncommon.length > 0 && (
            <details className="tsz-ve-more-voices" open={moreOpen}>
              <summary
                onClick={(event) => {
                  event.preventDefault();
                  setMoreOpen((open) => !open);
                }}
              >
                更多音色（{uncommon.length}）
                {selectedUncommon > 0 ? ` · 已选 ${selectedUncommon}` : ""}
              </summary>
              {renderGroups(uncommon)}
            </details>
          )}
        </>
      )}
      {auditionStatus && (
        <div className="tsz-ve-pop-status" aria-live="polite">
          {auditionStatus}
        </div>
      )}
    </div>
  );
}

/** 每个音色的倍率入口，调速和勾选/试听互不联动。 */
function VoiceRateControl({
  voice,
  ratePercent,
  readOnly,
  onChange
}: {
  voice: VoiceOption;
  ratePercent: number;
  readOnly?: boolean;
  onChange: (ratePercent: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [customRate, setCustomRate] = useState("");
  const [error, setError] = useState("");
  const allowed = (percent: number) =>
    !voice.rateRange ||
    (voice.rateRange.min <= percent && percent <= voice.rateRange.max);
  const apply = (percent: number) => {
    onChange(percent);
    setError("");
    setCustomRate("");
    setOpen(false);
  };
  return (
    <Popover
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      title={`${voiceShortName(voice)} · 语速`}
      content={
        <div role="group" aria-label={`${voice.label} 语速设置`}>
          <RatePanel
            readOnly={readOnly}
            ratePercent={ratePercent}
            isRateAllowed={allowed}
            onRate={apply}
            customRate={customRate}
            onCustomRateChange={setCustomRate}
            onCustomRateSubmit={(raw) => {
              const multiplier = Number(raw.trim());
              const percent = Math.round((multiplier - 1) * 100);
              if (
                !raw.trim() ||
                !Number.isFinite(multiplier) ||
                multiplier < RATE_MULTIPLIER_MIN ||
                multiplier > RATE_MULTIPLIER_MAX ||
                !allowed(percent)
              ) {
                setError("请输入该音色支持的语速，范围为 0.50×–2.00×");
                return;
              }
              apply(percent);
            }}
          />
          {error && (
            <Typography.Text type="danger" role="alert">
              {error}
            </Typography.Text>
          )}
        </div>
      }
    >
      <Button
        size="small"
        className="tsz-ve-voice-rate"
        disabled={readOnly || !voice.supportsRate}
        aria-label={`设置 ${voice.label} 的语速`}
      >
        {(1 + ratePercent / 100).toFixed(2)}×
      </Button>
    </Popover>
  );
}

export interface RatePanelProps {
  readOnly?: boolean;
  ratePercent?: number;
  isRateAllowed: (percent: number) => boolean;
  onRate: (percent: number) => void;
  customRate: string;
  onCustomRateChange: (value: string) => void;
  onCustomRateSubmit: (raw: string) => void;
}

/** 语速：一档一行的单选清单，末尾留自定义入口。 */
export function RatePanel({
  readOnly,
  ratePercent,
  isRateAllowed,
  onRate,
  customRate,
  onCustomRateChange,
  onCustomRateSubmit
}: RatePanelProps) {
  return (
    <div className="tsz-ve-pop tsz-ve-pop-rate" aria-label="语速微调">
      {RATE_PRESETS.map(({ multiplier, percent }) => (
        <PopRow
          key={multiplier}
          selected={ratePercent === percent}
          label={`${multiplier.toFixed(2)} ×`}
          meta={percent === 0 ? "原速" : undefined}
          ariaLabel={`语速 ${multiplier.toFixed(2)} 倍`}
          disabled={readOnly || !isRateAllowed(percent)}
          onToggle={() => onRate(percent)}
        />
      ))}
      <div className="tsz-ve-pop-divider" aria-hidden />
      <div className="tsz-ve-pop-foot">
        <Typography.Text type="secondary">自定义</Typography.Text>
        <Input
          size="small"
          className="tsz-ve-custom-input"
          aria-label="自定义语速倍数"
          placeholder="例如 1.10，回车生效"
          value={customRate}
          disabled={readOnly}
          onChange={(event) => onCustomRateChange(event.target.value)}
          /*
           * 用 onKeyDown 自己判回车，不用 antd 的 onPressEnter：实测 v6 的
           * onPressEnter **只触发一次**——同一个输入框第二次回车不再回调，裸
           * Input 也复现（与 Popover 无关），表现为「自定义值只有第一次生效」。
           * 值也直接从事件里取，免得再受闭包过期影响。
           */
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            onCustomRateSubmit((event.target as HTMLInputElement).value);
          }}
        />
      </div>
    </div>
  );
}

/** 下一批要添加的音频归到哪个语种/性别；每条加进来后就固定各自的归属。 */
export interface UploadDraft {
  locale: AudioAssetLocale;
  gender: AudioAssetGender;
}

export interface UploadPanelProps {
  readOnly?: boolean;
  /** 只允许上传这一侧的录音；不传表示这段正文不分英美。 */
  locale?: AudioAssetLocale;
  /** 没注入适配器、或存储未开通时为 false：整块置灰并说明原因。 */
  available: boolean;
  unavailableReason?: string;
  upload: UploadDraft;
  onUploadChange: (next: Partial<UploadDraft>) => void;
  /** 已落成资产的音频。 */
  assets: AudioAsset[];
  /** 还在路上或失败待重试的上传。 */
  pending: PendingUpload[];
  limit: number;
  onAddFiles: (files: FileList) => void;
  onRetryUpload: (id: string) => void;
  onDismissUpload: (id: string) => void;
  onRemoveAsset: (asset: AudioAsset) => void;
  onPlayAsset: (asset: AudioAsset) => void;
  playingAssetId?: string;
  /** 试听失败的说明；只在这块面板里显示。 */
  playbackMessage?: string;
}

const localeBadge = (locale: string) =>
  VOICE_LOCALES.find((item) => item.locale === locale)?.badge ?? locale;
const genderLabel = (gender: string) =>
  VOICE_GENDERS.find((item) => item.gender === gender)?.label ?? gender;

/**
 * 音频：先定归属再选文件；上面是还在路上的（进度 / 失败可重试），下面是已保存的（试听 / 移除）。
 * 上传本身在宿主注入的适配器里跑，这里只呈现队列。
 */
export function UploadPanel({
  readOnly,
  locale,
  available,
  unavailableReason,
  upload,
  onUploadChange,
  assets,
  pending,
  limit,
  onAddFiles,
  onRetryUpload,
  onDismissUpload,
  onRemoveAsset,
  onPlayAsset,
  playingAssetId,
  playbackMessage
}: UploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inFlight = pending.filter((item) => !item.error).length;
  const used = assets.length + inFlight;
  const canAdd = available && !readOnly && used < limit;
  return (
    <div className="tsz-ve-pop tsz-ve-pop-upload" aria-label="音频">
      {/*
       * 原生 file input 藏起来、只用它的能力：默认控件是英文且无法定制，
       * 更要命的是我们每次添加后会清空 value（好让同名文件能再传一次），
       * 于是它会永远显示「No file chosen」——下面明明已经列了几条。
       */}
      <input
        ref={fileInputRef}
        type="file"
        accept={AUDIO_UPLOAD_ACCEPT}
        multiple
        aria-label="上传音频"
        style={{ display: "none" }}
        disabled={!canAdd}
        onChange={(event) => {
          if (event.target.files?.length) onAddFiles(event.target.files);
          event.target.value = "";
        }}
      />

      {/*
       * 归属放在按钮之前：从上往下读即「先定归属 → 再选文件」，
       * 顺序本身说明了它只作用于接下来添加的那批，不必再写一句解释。
       */}
      <div className="tsz-ve-pop-field">
        <Typography.Text type="secondary">归属</Typography.Text>
        <Radio.Group
          size="small"
          optionType="button"
          aria-label="上传音频语种"
          value={upload.locale}
          disabled={readOnly || !available}
          onChange={(event) => onUploadChange({ locale: event.target.value })}
          options={VOICE_LOCALES.filter(
            (entry) => !locale || entry.locale === locale
          ).map(({ locale: value, badge }) => ({
            value,
            label: badge
          }))}
        />
        <Radio.Group
          size="small"
          optionType="button"
          aria-label="上传音频性别"
          value={upload.gender}
          disabled={readOnly || !available}
          onChange={(event) => onUploadChange({ gender: event.target.value })}
          options={VOICE_GENDERS.map(({ gender, label }) => ({
            value: gender,
            label
          }))}
        />
      </div>

      <Button
        block
        size="small"
        disabled={!canAdd}
        onClick={() => fileInputRef.current?.click()}
      >
        选择音频文件
      </Button>
      <Typography.Text
        type="secondary"
        className="tsz-ve-upload-hint"
        role={available ? undefined : "note"}
      >
        {available
          ? `${AUDIO_UPLOAD_HINT}，最多 ${limit} 条（已用 ${used}）`
          : unavailableReason}
      </Typography.Text>
      {playbackMessage && (
        <Typography.Text
          type="danger"
          className="tsz-ve-upload-hint"
          role="alert"
        >
          {playbackMessage}
        </Typography.Text>
      )}

      {(pending.length > 0 || assets.length > 0) && (
        <>
          <div className="tsz-ve-pop-divider" aria-hidden />
          <ul className="tsz-ve-upload-list" aria-label="已上传音频">
            {pending.map((item) => (
              <li
                key={item.id}
                className="tsz-ve-upload-item is-pending"
                data-state={item.error ? "failed" : "uploading"}
              >
                <span className="tsz-ve-upload-status" aria-hidden />
                <span className="tsz-ve-upload-name" title={item.name}>
                  {item.name}
                </span>
                {item.error ? (
                  <span className="tsz-ve-upload-error" role="alert">
                    {item.error.message}
                  </span>
                ) : (
                  <Progress
                    className="tsz-ve-upload-progress"
                    percent={progressPercent(item.progress)}
                    size="small"
                    showInfo={false}
                    aria-label={`上传进度 ${item.name}`}
                  />
                )}
                <span className="tsz-ve-upload-actions">
                  {item.error?.retryable && (
                    <Button
                      size="small"
                      type="text"
                      aria-label={`重试 ${item.name}`}
                      disabled={!available || readOnly}
                      onClick={() => onRetryUpload(item.id)}
                    >
                      重试
                    </Button>
                  )}
                  <Button
                    size="small"
                    type="text"
                    className="tsz-ve-upload-remove"
                    aria-label={`移除 ${item.name}`}
                    disabled={readOnly}
                    onClick={() => onDismissUpload(item.id)}
                  >
                    移除
                  </Button>
                </span>
              </li>
            ))}
            {assets.map((asset) => (
              <li key={asset.id} className="tsz-ve-upload-item">
                <Button
                  size="small"
                  type="text"
                  className="tsz-ve-audition-button"
                  aria-label={`试听 ${asset.original_name}`}
                  data-playing={playingAssetId === asset.id}
                  disabled={!available}
                  onClick={() => onPlayAsset(asset)}
                >
                  <SoundOutlined />
                </Button>
                <span
                  className="tsz-ve-upload-name"
                  title={asset.original_name}
                >
                  {asset.original_name}
                </span>
                <span className="tsz-ve-upload-tag">
                  {localeBadge(asset.locale)} · {genderLabel(asset.gender)}
                </span>
                {/* 移除只是从草稿里去掉引用、保存后才生效，但不进撤销栈，所以要确认一下 */}
                <Popconfirm
                  title="移除这条音频？"
                  description="保存草稿后生效"
                  okText="移除"
                  cancelText="取消"
                  okButtonProps={{ danger: true }}
                  disabled={readOnly}
                  onConfirm={() => onRemoveAsset(asset)}
                >
                  <Button
                    size="small"
                    type="text"
                    className="tsz-ve-upload-remove"
                    aria-label={`移除 ${asset.original_name}`}
                    disabled={readOnly}
                  >
                    移除
                  </Button>
                </Popconfirm>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** 连读弧图标：与标注带上真正画出来的那条弧同形，按钮和结果能对上。 */
export function LiaisonIcon() {
  return (
    <svg
      viewBox="0 0 24 12"
      width="22"
      height="11"
      aria-hidden
      focusable="false"
      className="tsz-ve-liaison-icon"
    >
      <path
        d="M2 11 C 6 1, 18 1, 22 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface RolePanelProps {
  readOnly?: boolean;
  hasWords: boolean;
  brush: Brush;
  onBrushChange: (brush: Brush) => void;
}

/** 语法结构：三分类各一行，色块在最左，选中即换笔。 */
export function RolePanel({
  readOnly,
  hasWords,
  brush,
  onBrushChange
}: RolePanelProps) {
  return (
    <div className="tsz-ve-pop tsz-ve-pop-roles" aria-label="语法结构">
      {GRAMMAR_ROLES.map((role) => (
        <PopRow
          key={role.level}
          selected={brush.kind === "role" && brush.level === role.level}
          label={
            <>
              <span
                className={`tsz-ve-pop-swatch is-${role.level}`}
                aria-hidden
              />
              {role.label}
            </>
          }
          ariaLabel={`用${role.label}画笔`}
          disabled={readOnly || !hasWords}
          onToggle={() => onBrushChange({ kind: "role", level: role.level })}
        />
      ))}
    </div>
  );
}

/**
 * 「起点 / 终点」：既回显锚点所在的词与选中的字母，也是一枚开关——按下哪一端，
 * 接下来点的字母就归哪一端。端别由人选而不按点击先后推断，先定终点再回头选起点、
 * 选完终点再回去扩起点都行。
 */
function AnchorSlot({
  label,
  slot,
  text,
  anchor,
  active,
  disabled,
  onSelect
}: {
  label: string;
  slot: LiaisonEnd;
  text: string;
  anchor?: LiaisonAnchor;
  active: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  const letters = anchor ? anchorLetters(text, anchor) : "";
  return (
    <button
      type="button"
      className="tsz-ve-anchor-field"
      aria-pressed={active}
      aria-label={`选择${label}`}
      disabled={disabled}
      onClick={onSelect}
    >
      <Typography.Text type="secondary">{label}</Typography.Text>
      {letters ? (
        <span className={`tsz-ve-anchor-slot is-${slot}`}>
          <span className="tsz-ve-anchor-letters">{letters}</span>
        </span>
      ) : (
        <Typography.Text type="secondary">—</Typography.Text>
      )}
    </button>
  );
}

export interface LiaisonPanelProps {
  readOnly?: boolean;
  text: string;
  draft: LiaisonDraft;
  /** 接下来点的字母归哪一端。 */
  activeEnd: LiaisonEnd;
  onActiveEndChange: (end: LiaisonEnd) => void;
  onCommit: () => void;
  onResetDraft: () => void;
}

/**
 * 连读：这层浮层是「连读工作台」，起点/终点边点边回显。
 *
 * 它必须开在工具栏**上方**——选锚点要在下面的文字上点字母，浮层开在下方会把
 * 标注带整个盖住，等于自断操作路径。开在上方盖住的是文本框，不影响落笔。
 */
export function LiaisonPanel({
  readOnly,
  text,
  draft,
  activeEnd,
  onActiveEndChange,
  onCommit,
  onResetDraft
}: LiaisonPanelProps) {
  /*
   * 颜色订阅放在面板里而不是编辑器根上：拖取色器时每个 mousemove 都会改色，
   * 订阅挂在根上会让同一页的几十个编辑器整树重渲染。弧线层自己订阅，不经这里。
   */
  const color = useLiaisonColor();
  const bothPicked = Boolean(draft.start && draft.end);
  const canCommit = bothPicked;
  const hint = !draft.start && !draft.end ? "点下面文字里的字母" : undefined;
  return (
    <div className="tsz-ve-pop tsz-ve-pop-liaison" aria-label="连读">
      {/* 压成两行：这层浮层开在工具栏上方，再高就顶到抽屉标题栏了。 */}
      <div className="tsz-ve-liaison-anchors">
        {LIAISON_ANCHORS.map(({ anchor, label }, index) => (
          <Fragment key={anchor}>
            {index > 0 && (
              <span className="tsz-ve-liaison-arrow" aria-hidden>
                →
              </span>
            )}
            <AnchorSlot
              label={label}
              slot={anchor}
              text={text}
              anchor={draft[anchor]}
              active={activeEnd === anchor}
              disabled={readOnly}
              onSelect={() => onActiveEndChange(anchor)}
            />
          </Fragment>
        ))}
      </div>
      <div className="tsz-ve-liaison-actions">
        <span className="tsz-ve-liaison-color">
          <Typography.Text type="secondary">颜色</Typography.Text>
          {/* 显示偏好而非内容：wire 的 liaison 没有颜色字段，见 marks/liaisonColor。 */}
          <ColorPicker
            size="small"
            value={color}
            disabledAlpha
            disabled={readOnly}
            onChange={(value) => setLiaisonColor(value.toHexString())}
          />
        </span>
        {/* 未选择端点时提示操作方式。 */}
        {hint && <span className="tsz-ve-pop-hint">{hint}</span>}
        <Button
          size="small"
          type="primary"
          className="tsz-ve-liaison-commit"
          aria-label="添加连读"
          disabled={readOnly || !canCommit}
          onClick={onCommit}
        >
          添加
        </Button>
        <Button
          size="small"
          type="text"
          aria-label="重选"
          disabled={readOnly || (!draft.start && !draft.end)}
          onClick={onResetDraft}
        >
          重选
        </Button>
      </div>
    </div>
  );
}

export interface PausePanelProps {
  readOnly?: boolean;
  hasWords: boolean;
  brush: Brush;
  onBrushChange: (brush: Brush) => void;
  customPause: string;
  onCustomPauseChange: (value: string) => void;
  onCustomPauseSubmit: (raw: string) => void;
}

/** 停顿：预设时长各一行，末尾留自定义入口。 */
export function PausePanel({
  readOnly,
  hasWords,
  brush,
  onBrushChange,
  customPause,
  onCustomPauseChange,
  onCustomPauseSubmit
}: PausePanelProps) {
  const current = brush.kind === "pause" ? brush.durationMs : undefined;
  /* 自定义值不在预设里时也补成一行，保证「当前armed的是哪个时长」始终可见。 */
  const choices =
    current === undefined || PAUSE_PRESETS.includes(current)
      ? [...PAUSE_PRESETS]
      : [...PAUSE_PRESETS, current].sort((a, b) => a - b);
  return (
    <div className="tsz-ve-pop tsz-ve-pop-pause" aria-label="停顿">
      {choices.map((duration) => (
        <PopRow
          key={duration}
          selected={current === duration}
          label={formatPauseLabel(duration)}
          ariaLabel={`用停顿画笔 ${formatPauseLabel(duration)}`}
          disabled={readOnly || !hasWords}
          onToggle={() =>
            onBrushChange({ kind: "pause", durationMs: duration })
          }
        />
      ))}
      <div className="tsz-ve-pop-divider" aria-hidden />
      <div className="tsz-ve-pop-foot">
        <Typography.Text type="secondary">自定义</Typography.Text>
        <Input
          size="small"
          className="tsz-ve-custom-input"
          aria-label="自定义停顿毫秒"
          placeholder="毫秒，回车"
          value={customPause}
          disabled={readOnly}
          onChange={(event) => onCustomPauseChange(event.target.value)}
          // 同 RatePanel：antd v6 的 onPressEnter 只触发一次，这里自己判回车。
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            onCustomPauseSubmit((event.target as HTMLInputElement).value);
          }}
        />
      </div>
    </div>
  );
}
