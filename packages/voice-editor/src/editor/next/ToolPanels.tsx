import { CheckOutlined, SoundOutlined } from "@ant-design/icons";
import { Button, Input, Radio, Spin, Typography } from "antd";
import type { ReactNode } from "react";
import { useRef } from "react";
import type { VoiceOption } from "../../types";
import {
  GRAMMAR_ROLES,
  PAUSE_PRESETS,
  RATE_PRESETS,
  VOICE_GENDERS,
  VOICE_LOCALES,
  formatPauseLabel,
  voiceShortName
} from "./roles";
import type { Brush } from "./roles";
import { anchorLetters } from "./tokens";
import type { LiaisonAnchor, LiaisonDraft, Token } from "./tokens";

/**
 * 工具栏上三个下拉工具（音色 / 语速 / 音频）的面板。
 *
 * 它们挂在工具栏按钮下方的浮层里，形态就该是下拉菜单：一行一项、竖着扫、
 * 勾选态固定在最左一列。之前这里塞的是为整块「发音设置」卡片设计的宽卡片
 * （语种徽标浮在角外、女声/男声表头重复两遍），装进浮层必然溢出并被切边——
 * 那不是样式没调好，是形态选错了，所以这里重做而不是复用。
 */

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
  voices: VoiceOption[];
  voicesLoading: boolean;
  enabledVoiceIds: string[];
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
  voices,
  voicesLoading,
  enabledVoiceIds,
  onToggleVoice,
  pendingVoiceId,
  playingVoiceId,
  canAudition,
  onAudition,
  auditionStatus
}: VoicePanelProps) {
  return (
    <div className="tsz-ve-pop tsz-ve-pop-voices" aria-label="音色清单">
      {voicesLoading ? (
        <div className="tsz-ve-pop-loading">
          <Spin size="small" aria-label="正在加载音色" />
        </div>
      ) : (
        VOICE_LOCALES.map(({ locale, badge }) => {
          const group = voices.filter((voice) => voice.locale === locale);
          if (group.length === 0) return null;
          return (
            <PopSection key={locale} title={badge} locale={locale}>
              {group.map((voice) => (
                <PopRow
                  key={voice.id}
                  selected={enabledVoiceIds.includes(voice.id)}
                  label={voiceShortName(voice)}
                  meta={
                    VOICE_GENDERS.find((item) => item.gender === voice.gender)
                      ?.label ?? voice.gender
                  }
                  ariaLabel={`启用 ${voice.label}`}
                  disabled={readOnly}
                  onToggle={() => onToggleVoice(voice.id)}
                  trailing={
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
                  }
                />
              ))}
            </PopSection>
          );
        })
      )}
      {auditionStatus && (
        <div className="tsz-ve-pop-status" aria-live="polite">
          {auditionStatus}
        </div>
      )}
    </div>
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
  locale: string;
  gender: string;
}

export interface UploadedAudio {
  id: string;
  name: string;
  locale: string;
  gender: string;
  /** object URL，仅用于本地试听；删除与卸载时必须 revoke。 */
  url: string;
}

export interface UploadPanelProps {
  readOnly?: boolean;
  upload: UploadDraft;
  onUploadChange: (next: Partial<UploadDraft>) => void;
  uploads: UploadedAudio[];
  onAddUploads: (files: FileList) => void;
  onRemoveUpload: (id: string) => void;
  onPlayUpload: (item: UploadedAudio) => void;
  playingUploadId?: string;
}

/** 音频：先定归属再选文件，已添加的列在下面。 */
export function UploadPanel({
  readOnly,
  upload,
  onUploadChange,
  uploads,
  onAddUploads,
  onRemoveUpload,
  onPlayUpload,
  playingUploadId
}: UploadPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        accept="audio/*"
        multiple
        aria-label="上传音频"
        style={{ display: "none" }}
        disabled={readOnly}
        onChange={(event) => {
          if (event.target.files?.length) onAddUploads(event.target.files);
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
          disabled={readOnly}
          onChange={(event) => onUploadChange({ locale: event.target.value })}
          options={VOICE_LOCALES.map(({ locale, badge }) => ({
            value: locale,
            label: badge
          }))}
        />
        <Radio.Group
          size="small"
          optionType="button"
          aria-label="上传音频性别"
          value={upload.gender}
          disabled={readOnly}
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
        disabled={readOnly}
        onClick={() => fileInputRef.current?.click()}
      >
        选择音频文件
      </Button>

      {uploads.length > 0 && (
        <>
          <div className="tsz-ve-pop-divider" aria-hidden />
          <ul className="tsz-ve-upload-list" aria-label="已上传音频">
            {uploads.map((item) => (
              <li key={item.id} className="tsz-ve-upload-item">
                <Button
                  size="small"
                  type="text"
                  className="tsz-ve-audition-button"
                  aria-label={`试听 ${item.name}`}
                  data-playing={playingUploadId === item.id}
                  onClick={() => onPlayUpload(item)}
                >
                  <SoundOutlined />
                </Button>
                <span className="tsz-ve-upload-name" title={item.name}>
                  {item.name}
                </span>
                <span className="tsz-ve-upload-tag">
                  {VOICE_LOCALES.find((l) => l.locale === item.locale)?.badge ??
                    item.locale}
                </span>
                <Button
                  size="small"
                  type="text"
                  className="tsz-ve-upload-remove"
                  aria-label={`移除 ${item.name}`}
                  disabled={readOnly}
                  onClick={() => onRemoveUpload(item.id)}
                >
                  移除
                </Button>
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

/** 「起点 / 终点」回显：显示锚点所在的词，以及词里选中的那几个字母。 */
function AnchorSlot({
  label,
  slot,
  tokens,
  anchor
}: {
  label: string;
  slot: "start" | "end";
  tokens: Token[];
  anchor?: LiaisonAnchor;
}) {
  const word = anchor ? tokens[anchor.token]?.text : undefined;
  const letters = anchor ? anchorLetters(tokens, anchor) : "";
  return (
    <span className="tsz-ve-anchor-field">
      <Typography.Text type="secondary">{label}</Typography.Text>
      {word ? (
        <span className={`tsz-ve-anchor-slot is-${slot}`}>
          {word}
          <span className="tsz-ve-anchor-letters">{letters}</span>
        </span>
      ) : (
        <Typography.Text type="secondary">—</Typography.Text>
      )}
    </span>
  );
}

export interface LiaisonPanelProps {
  readOnly?: boolean;
  tokens: Token[];
  draft: LiaisonDraft;
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
  tokens,
  draft,
  onCommit,
  onResetDraft
}: LiaisonPanelProps) {
  const canCommit =
    Boolean(draft.start && draft.end) &&
    draft.start!.token !== draft.end!.token;
  return (
    <div className="tsz-ve-pop tsz-ve-pop-liaison" aria-label="连读">
      {/* 压成两行：这层浮层开在工具栏上方，再高就顶到抽屉标题栏了。 */}
      <div className="tsz-ve-liaison-anchors">
        <AnchorSlot
          label="起点"
          slot="start"
          tokens={tokens}
          anchor={draft.start}
        />
        <span className="tsz-ve-liaison-arrow" aria-hidden>
          →
        </span>
        <AnchorSlot
          label="终点"
          slot="end"
          tokens={tokens}
          anchor={draft.end}
        />
      </div>
      <div className="tsz-ve-liaison-actions">
        {/* 上手提示只在还没落第一个锚点时占位，选起来之后就让位给按钮。 */}
        {!draft.start && (
          <span className="tsz-ve-pop-hint">点下面文字里的字母</span>
        )}
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
