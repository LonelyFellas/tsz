import type { NextDraft, NextEntryView } from "@tsz/types";
import { localeLabels } from "./model";

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
            {localeLabels[row.locale]}：
          </span>
          <span className={textClassName}>{row.text || "（空白）"}</span>
        </li>
      ))}
    </ul>
  ) : (
    <p className="lexicon-next-muted">缺少{missing}</p>
  );
}
export function Preview({ view }: { view: NextEntryView }) {
  return (
    <div className="lexicon-next-preview">
      <Lines rows={view.forms} missing="词形" textClassName="tsz-words" />
      {!view.senses.length && <p>尚无义项</p>}
      {view.senses.map((sense, index) => (
        <section key={sense.id}>
          <h4>义项 {index + 1}</h4>
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
      <Lines rows={draft.forms} missing="词形" textClassName="tsz-words" />
      {draft.senses.map((sense, index) => (
        <section key={sense.id}>
          <h4>
            义项 {index + 1} · {sense.part_of_speech ?? "未指定词性"}
          </h4>
          <Lines rows={sense.definitions} missing="释义" />
          <Lines rows={sense.equivalents} missing="译词" />
        </section>
      ))}
    </div>
  );
}
