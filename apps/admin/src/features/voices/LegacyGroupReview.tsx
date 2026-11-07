import { useState } from "react";
import { Alert, Button, Space, Typography } from "@tsz/ui/admin/display";
import { Checkbox, Input } from "@tsz/ui/admin/forms";
import { Modal } from "@tsz/ui/admin/overlays";
import type {
  AdminDubbingRecommendationPair,
  AdminSpeechVoice
} from "@tsz/types";
import { newWordNodeId } from "@/features/dictionary/word-model/primitives";
import {
  legacyComplete,
  sides,
  sideName,
  type DubbingDraft
} from "./dubbing-model";
import { VoiceName, VoiceRate, VoiceVolume } from "./VoiceDisplay";

export function LegacyGroupReview({
  group,
  voices,
  open,
  disabled,
  onCancel,
  onAdd,
  onRemove,
  onComplete
}: {
  group: DubbingDraft;
  voices: AdminSpeechVoice[];
  open: boolean;
  disabled: boolean;
  onCancel: () => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  onComplete: (pairs: AdminDubbingRecommendationPair[]) => void;
}) {
  const [name, setName] = useState("自然朗读");
  const [confirmed, setConfirmed] = useState(false);
  const rec = group.recommendations;
  const [selected, setSelected] = useState(
    () =>
      rec.format === "legacy" &&
      rec.uk[0]?.selected !== false &&
      rec.us[0]?.selected !== false
  );
  if (rec.format !== "legacy") return null;
  const pairs = group.legacyPairs ?? [];
  const simple =
    rec.uk.length === 1 && rec.us.length === 1 && pairs.length === 0;
  function confirmSimple() {
    if (rec.format !== "legacy" || !confirmed || !name.trim() || disabled)
      return;
    const {
      id: ukId,
      voice_alias: ukVoice,
      parameters: ukParameters
    } = rec.uk[0]!;
    const {
      id: usId,
      voice_alias: usVoice,
      parameters: usParameters
    } = rec.us[0]!;
    onComplete([
      {
        id: newWordNodeId(),
        name: name.trim(),
        selected,
        uk: {
          id: ukId,
          voice_alias: ukVoice,
          parameters: structuredClone(ukParameters)
        },
        us: {
          id: usId,
          voice_alias: usVoice,
          parameters: structuredClone(usParameters)
        }
      }
    ]);
  }
  return (
    <Modal
      open={open}
      title="确认原有声音"
      onCancel={onCancel}
      footer={null}
      width={720}
    >
      <Typography.Paragraph type="secondary">
        保留原有音色与参数，确认英美两侧的对应关系。确认只更新本组草稿。
      </Typography.Paragraph>
      <div className="dubbing-legacy-review-columns">
        {sides.map((side) => (
          <section key={side} aria-label={`${sideName(side)}原有声音`}>
            <Typography.Title level={5} className={`voice-accent-${side}`}>
              {sideName(side)}
            </Typography.Title>
            {rec[side].map((item, index) => {
              const voice = voices.find((v) => v.alias === item.voice_alias);
              const paired = pairs.some((pair) => pair[side].id === item.id);
              return (
                <div className="dubbing-review-voice" key={item.id}>
                  {!simple && (
                    <Typography.Text type="secondary">
                      {index + 1}. {item.name}
                      {paired ? " · 已组成推荐套" : ""}
                    </Typography.Text>
                  )}
                  <div>
                    {voice ? (
                      <VoiceName voice={voice} />
                    ) : (
                      <Typography.Text type="danger">
                        声音已不可用：{item.voice_alias}
                      </Typography.Text>
                    )}
                  </div>
                  <Space size={16}>
                    <span>
                      语速 <VoiceRate parameters={item.parameters} />
                    </span>
                    <span>
                      音量 <VoiceVolume parameters={item.parameters} />
                    </span>
                  </Space>
                </div>
              );
            })}
            {!rec[side].length && (
              <Typography.Text type="secondary">
                尚无原有声音，可为推荐套补充这一侧。
              </Typography.Text>
            )}
          </section>
        ))}
      </div>
      {simple ? (
        <div className="dubbing-simple-confirmation">
          <label htmlFor="legacy-pair-name">推荐名称</label>
          <Input
            id="legacy-pair-name"
            aria-label="原有声音推荐名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            disabled={disabled}
          />
          <Checkbox
            checked={selected}
            onChange={(event) => setSelected(event.target.checked)}
            disabled={disabled}
          >
            选用这套推荐
          </Checkbox>
          <Checkbox
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={disabled}
          >
            确认将这两个声音组成同一套推荐
          </Checkbox>
          <div className="dubbing-dialog-actions">
            <Button onClick={onCancel}>暂不整理</Button>
            <Button
              type="primary"
              disabled={disabled || !confirmed || !name.trim()}
              onClick={confirmSimple}
            >
              确认组合
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Typography.Paragraph type="secondary">
            逐套组合现有声音，也可以补充缺少的一侧。所有声音设置都会保留，包括未选用的声音。
          </Typography.Paragraph>
          {pairs.map((pair) => (
            <div key={pair.id} className="dubbing-reviewed-pair">
              <span>{pair.name}</span>
              <Button
                type="text"
                disabled={disabled}
                onClick={() => onRemove(pair.id)}
              >
                重新组合
              </Button>
            </div>
          ))}
          <Button disabled={disabled || pairs.length >= 20} onClick={onAdd}>
            新增一套组合
          </Button>
          {!legacyComplete(group) && (
            <Alert
              className="dubbing-review-progress"
              type="info"
              title={`已确认 ${pairs.length} 套，还有原有声音待安排。`}
            />
          )}
          <div className="dubbing-dialog-actions">
            <Button onClick={onCancel}>取消</Button>
            <Button
              type="primary"
              disabled={disabled || !legacyComplete(group)}
              onClick={() => onComplete(pairs)}
            >
              确认全部组合
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
