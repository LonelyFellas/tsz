import type { NextDraft, NextEntryView } from "@tsz/types";
import { draftForms, localeLabels } from "./model";

function Lines({
  rows,
  missing,
  textClassName
}: {
  rows: { id: string; locale: string; text: string }[];
  missing: string;
  textClassName?: string;
}) {
  return rows.length ? (
    <ul>
      {rows.map((row) => (
        <li key={row.id}>
          <span className="lexicon-next-muted">
            {localeLabels[row.locale] ?? row.locale}：
          </span>
          <span className={textClassName}>{row.text || "（空白）"}</span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="lexicon-next-muted">缺少{missing}</p>
  );
}
function SenseGroups({ groups }: { groups: NextDraft["sense_groups"] }) {
  return groups?.length ? (
    <section aria-label="语义区间">
      <h4>语义区间</h4>
      <ul>
        {groups.map((group) => (
          <li key={group.id}>
            {group.name_zh || "（未填写中文）"} ·{" "}
            <span className="tsz-words">
              {group.name_en || "（未填写英文）"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  ) : null;
}
function senseGroupName(groups: NextDraft["sense_groups"], id?: string) {
  const group = groups?.find((row) => row.id === id);
  return group
    ? ` · ${group.name_zh || group.name_en || "未填写语义区间"}`
    : "";
}
export function Preview({ view }: { view: NextEntryView }) {
  return (
    <div className="lexicon-next-preview">
      <SenseGroups groups={view.sense_groups} />
      <Lines rows={view.forms} missing="词形" textClassName="tsz-words" />
      {!view.senses.length && <p>尚无义项</p>}
      {view.senses.map((sense, index) => (
        <section key={sense.id}>
          <h4>
            义项 {index + 1}
            {senseGroupName(view.sense_groups, sense.sense_group_id)}
          </h4>
          <Lines rows={sense.target_definitions} missing="英文释义" />
          <Lines rows={sense.medium_definitions} missing="中文解释" />
          <Lines rows={sense.equivalents} missing="译词" />
        </section>
      ))}
    </div>
  );
}
export function DraftSummary({ draft }: { draft: NextDraft }) {
  return (
    <div className="lexicon-next-preview">
      <h4 className="tsz-words">{draft.headword}</h4>
      <SenseGroups groups={draft.sense_groups} />
      <Lines
        rows={draftForms(draft)}
        missing="词形"
        textClassName="tsz-words"
      />
      {draft.senses.map((sense, index) => (
        <section key={sense.id}>
          <h4>
            义项 {index + 1} · {sense.part_of_speech ?? "未指定词性"}
            {senseGroupName(draft.sense_groups, sense.sense_group_id)}
          </h4>
          <Lines rows={sense.definitions} missing="释义" />
          <Lines rows={sense.equivalents} missing="译词" />
        </section>
      ))}
    </div>
  );
}
