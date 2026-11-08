import { useVoiceTranslation } from "./i18n";
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
  const { t } = useVoiceTranslation();
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
      title={t("confirm_existing_voices")}
      onCancel={onCancel}
      footer={null}
      width={720}
    >
      <Typography.Paragraph type="secondary">
        {t("keep_existing_voices_and_parameters_and_confirm_their_british_and")}
      </Typography.Paragraph>
      <div className="dubbing-legacy-review-columns">
        {sides.map((side) => (
          <section
            key={side}
            aria-label={t("legacy_side", { side: sideName(side, t) })}
          >
            <Typography.Title level={5} className={`voice-accent-${side}`}>
              {sideName(side, t)}
            </Typography.Title>
            {rec[side].map((item, index) => {
              const voice = voices.find((v) => v.alias === item.voice_alias);
              const paired = pairs.some((pair) => pair[side].id === item.id);
              return (
                <div className="dubbing-review-voice" key={item.id}>
                  {!simple && (
                    <Typography.Text type="secondary">
                      {index + 1}. {item.name}
                      {paired ? " " + t("paired") : ""}
                    </Typography.Text>
                  )}
                  <div>
                    {voice ? (
                      <VoiceName voice={voice} />
                    ) : (
                      <Typography.Text type="danger">
                        {t("legacy_unavailable_voice", {
                          alias: item.voice_alias
                        })}
                      </Typography.Text>
                    )}
                  </div>
                  <Space size={16}>
                    <span>
                      {t("rate")} <VoiceRate parameters={item.parameters} />
                    </span>
                    <span>
                      {t("volume")} <VoiceVolume parameters={item.parameters} />
                    </span>
                  </Space>
                </div>
              );
            })}
            {!rec[side].length && (
              <Typography.Text type="secondary">
                {t(
                  "no_existing_voice_add_this_side_to_the_recommendation_pair"
                )}
              </Typography.Text>
            )}
          </section>
        ))}
      </div>
      {simple ? (
        <div className="dubbing-simple-confirmation">
          <label htmlFor="legacy-pair-name">{t("recommendation_name")}</label>
          <Input
            id="legacy-pair-name"
            aria-label={t("existing_voice_recommendation_name")}
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
            {t("select_this_recommendation_pair")}
          </Checkbox>
          <Checkbox
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={disabled}
          >
            {t("confirm_these_two_voices_as_one_recommendation_pair")}
          </Checkbox>
          <div className="dubbing-dialog-actions">
            <Button onClick={onCancel}>{t("organise_later")}</Button>
            <Button
              type="primary"
              disabled={disabled || !confirmed || !name.trim()}
              onClick={confirmSimple}
            >
              {t("confirm_pair")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Typography.Paragraph type="secondary">
            {t(
              "pair_existing_voices_and_add_any_missing_side_all_voice_settings_"
            )}
          </Typography.Paragraph>
          {pairs.map((pair) => (
            <div key={pair.id} className="dubbing-reviewed-pair">
              <span>{pair.name}</span>
              <Button
                type="text"
                disabled={disabled}
                onClick={() => onRemove(pair.id)}
              >
                {t("re_pair")}
              </Button>
            </div>
          ))}
          <Button disabled={disabled || pairs.length >= 20} onClick={onAdd}>
            {t("add_a_pair")}
          </Button>
          {!legacyComplete(group) && (
            <Alert
              className="dubbing-review-progress"
              type="info"
              title={t("legacy_progress", { count: pairs.length })}
            />
          )}
          <div className="dubbing-dialog-actions">
            <Button onClick={onCancel}>{t("cancel")}</Button>
            <Button
              type="primary"
              disabled={disabled || !legacyComplete(group)}
              onClick={() => onComplete(pairs)}
            >
              {t("confirm_all_pairs")}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
