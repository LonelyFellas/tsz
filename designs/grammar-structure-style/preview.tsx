import { useState } from "react";
import { createRoot } from "react-dom/client";
import type { NextGrammarStructure } from "@tsz/types";
import { Button } from "@tsz/ui/admin/display";
import { Select } from "@tsz/ui/admin/forms";
import { App } from "@tsz/ui/admin/overlays";
import { GrammarStructures } from "../../apps/admin/src/features/lexicon-next/GrammarStructures";
import { partOfSpeechCatalogFixture } from "../../apps/admin/src/features/dictionary/word-creation/partOfSpeech.test.helper";
import "../../apps/admin/src/globals.css";
import "../../apps/admin/src/pages/lexicon-next.css";

function fixture(filled: boolean): NextGrammarStructure[] {
  return [
    "",
    filled ? "a job" : "",
    filled
      ? "a job that involves working with people and helping them to find a solution to a difficult problem\nThis structure can also be used with a longer explanation."
      : ""
  ].map((text, index) => ({
    id: `local-grammar-${index}`,
    part_of_speech: "noun",
    sub_pos: filled && index ? "N-COUNT" : undefined,
    variants: [
      {
        id: `local-variant-${index}`,
        locale: "en-GB",
        content: {
          version: 2,
          text,
          annotations: text
            ? [{ type: "emphasis", start: 2, end: 5, level: "core" }]
            : []
        }
      }
    ]
  }));
}

function Preview() {
  const [rows, setRows] = useState(() => fixture(false));
  const [mode, setMode] = useState("empty");
  const [narrow, setNarrow] = useState(false);
  return (
    <App>
      <main data-screen-label="语法结构样式预览">
        <div className="preview-toolbar">
          <label htmlFor="preview-state">本地样例</label>
          <Select
            id="preview-state"
            aria-label="样例状态"
            value={mode}
            options={[
              { value: "empty", label: "空内容" },
              { value: "filled", label: "含标注与长内容" },
              { value: "disabled", label: "禁用状态" }
            ]}
            onChange={(value: string) => {
              setMode(value);
              setRows(fixture(value !== "empty"));
            }}
            style={{ width: 180 }}
          />
          <Button aria-pressed={narrow} onClick={() => setNarrow(!narrow)}>
            {narrow ? "恢复完整宽度" : "较窄容器"}
          </Button>
        </div>
        <div className="preview-panel" data-narrow={narrow}>
          <GrammarStructures
            rows={rows}
            pos="noun"
            catalog={partOfSpeechCatalogFixture.items.find(
              (item) => item.code === "noun"
            )}
            target="en-GB"
            disabled={mode === "disabled"}
            referenceCount={() => 0}
            onChange={setRows}
          />
        </div>
      </main>
    </App>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
