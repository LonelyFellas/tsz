import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App, Button, ConfigProvider } from "antd";
import type { SharedFormsStepContentV3 } from "@tsz/types";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  commonFormFixture,
  formsFixture,
  pronunciationFixture,
  uuidFromInt
} from "../fixtures";
import { applyFormsStructure } from "../sharedFormsModel";
import {
  V3FormCopyHandle,
  V3FormCopyProvider,
  useV3FormCopy
} from "./V3FormCopyProvider";

const resolveProfiles = vi.hoisted(() => vi.fn());
vi.mock("../formCopyProfiles", () => ({
  resolveFormCopyProfiles: resolveProfiles
}));

function fixture(targetCount = 1): SharedFormsStepContentV3 {
  return applyFormsStructure(
    { forms_format: "shared_v1", contents: [], pos: [] },
    formsFixture({
      forms: [
        commonFormFixture({
          spelling: "read",
          pronunciations: [
            pronunciationFixture({
              actual_pron: "source",
              dict_phonetic: "source"
            })
          ]
        }),
        commonFormFixture({
          id: uuidFromInt(900),
          spelling: "reads",
          form_type: "plural",
          pronunciations: Array.from({ length: targetCount }, (_, index) =>
            pronunciationFixture({
              id: uuidFromInt(910 + index),
              actual_pron: `target-${index}`,
              dict_phonetic: `target-${index}`
            })
          )
        })
      ]
    })
  ) as SharedFormsStepContentV3;
}
function EditProbe() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>编辑词形内容</Button>
      {open && <div role="dialog">旧草稿抽屉</div>}
    </>
  );
}
function Cells({ forms }: { forms: SharedFormsStepContentV3 }) {
  const copy = useV3FormCopy()!;
  return (
    <>
      {forms.pos[0]!.forms.map((form, index) => (
        <div key={form.id} data-testid={`form-${index}`}>
          <V3FormCopyHandle formId={form.id} kind="phonetics" />
          <V3FormCopyHandle formId={form.id} kind="voices" />
          <div
            {...copy.cell(form.id, "phonetics")}
            data-testid={`phonetics-${index}`}
          >
            音标落点 {index}
          </div>
          <div
            {...copy.cell(form.id, "voices")}
            data-testid={`voices-${index}`}
          >
            音色落点 {index}
          </div>
        </div>
      ))}
    </>
  );
}
function Harness({
  initial = fixture()
}: {
  initial?: SharedFormsStepContentV3;
}) {
  const [forms, setForms] = useState(initial);
  return (
    <ConfigProvider>
      <App>
        <V3FormCopyProvider forms={forms} onChange={setForms}>
          <Cells forms={forms} />
          <EditProbe />
          <button
            onClick={() => {
              const next = structuredClone(forms);
              const region = next.contents[1]!.regional_variants;
              if (region.mode === "common")
                region.common.pronunciations[0]!.actual_pron = "later-edit";
              setForms(next);
            }}
          >
            随后编辑目标
          </button>
        </V3FormCopyProvider>
        <output data-testid="forms">{JSON.stringify(forms)}</output>
      </App>
    </ConfigProvider>
  );
}
function current() {
  return JSON.parse(
    screen.getByTestId("forms").textContent!
  ) as SharedFormsStepContentV3;
}
function targetPronunciation() {
  const regions = current().contents[1]!.regional_variants;
  if (regions.mode !== "common") throw new Error("fixture");
  return regions.common.pronunciations[0]!;
}
function begin() {
  fireEvent.click(
    within(screen.getByTestId("form-0")).getByRole("button", {
      name: "复制英美音标"
    })
  );
}

beforeEach(() => {
  resolveProfiles.mockReset().mockResolvedValue([]);
});

describe("词形复制交互", () => {
  it("点击和键盘复制到草稿，来源不变，允许撤销", async () => {
    const initial = fixture();
    render(<Harness initial={initial} />);
    const sourceButton = within(screen.getByTestId("form-0")).getByRole(
      "button",
      { name: "复制英美音标" }
    );
    fireEvent.click(sourceButton);
    fireEvent.keyDown(sourceButton, { key: "ArrowDown" });
    expect(screen.getByTestId("phonetics-1")).toHaveClass("is-copy-target");
    fireEvent.keyDown(sourceButton, { key: "Enter" });
    await waitFor(() =>
      expect(targetPronunciation().actual_pron).toBe("source")
    );
    expect(current().contents[0]).toEqual(initial.contents[0]);
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(current()).toEqual(initial);
  });

  it("指针拖动只接受同类落点，松手复制且取消不修改", async () => {
    render(<Harness />);
    const sourceButton = within(screen.getByTestId("form-0")).getByRole(
      "button",
      { name: "复制英美音标" }
    );
    const elementFromPoint = vi
      .fn()
      .mockReturnValue(screen.getByTestId("voices-1"));
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: elementFromPoint
    });
    const dispatch = (name: string, x: number, y: number) => {
      const event = new MouseEvent(name, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: y
      });
      Object.defineProperty(event, "pointerId", { value: 1 });
      fireEvent(sourceButton, event);
    };
    dispatch("pointerdown", 10, 100);
    dispatch("pointermove", 30, 120);
    expect(screen.getByTestId("voices-1")).not.toHaveClass("is-copy-target");
    elementFromPoint.mockReturnValue(screen.getByTestId("phonetics-1"));
    dispatch("pointermove", 50, 130);
    expect(screen.getByTestId("phonetics-1")).toHaveClass("is-copy-target");
    dispatch("pointerup", 50, 130);
    await waitFor(() =>
      expect(targetPronunciation().actual_pron).toBe("source")
    );
    begin();
    fireEvent.keyDown(sourceButton, { key: "Escape" });
    expect(sourceButton).toHaveAttribute("aria-pressed", "false");
  });

  it("版本数量不同需明确映射，取消保留所有目标内容", async () => {
    const initial = fixture(2);
    render(<Harness initial={initial} />);
    begin();
    fireEvent.click(screen.getByTestId("phonetics-1"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getAllByRole("combobox")).toHaveLength(4);
    fireEvent.click(within(dialog).getByRole("button", { name: "取 消" }));
    expect(current()).toEqual(initial);
  });

  it("共享目标在应用前提示所有受影响标签", async () => {
    const initial = fixture();
    const alias = structuredClone(initial.pos[0]!.forms[1]!);
    alias.id = uuidFromInt(950);
    alias.form_type = "past";
    initial.pos[0]!.forms.push(alias);
    render(<Harness initial={initial} />);
    begin();
    fireEvent.click(screen.getByTestId("phonetics-1"));
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByText("这些标签共用目标内容，将一起更新")
    ).toBeInTheDocument();
    expect(current()).toEqual(initial);
    fireEvent.click(within(dialog).getByRole("button", { name: "复制到草稿" }));
    await waitFor(() =>
      expect(targetPronunciation().actual_pron).toBe("source")
    );
    expect(current().pos).toEqual(initial.pos);
  });

  it("后续编辑阻止撤销覆盖新值", async () => {
    render(<Harness />);
    begin();
    fireEvent.click(screen.getByTestId("phonetics-1"));
    await screen.findByRole("button", { name: "撤销" });
    fireEvent.click(screen.getByRole("button", { name: "随后编辑目标" }));
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(targetPronunciation().actual_pron).toBe("later-edit");
    expect(
      screen.getByText("目标在复制后又被修改，不能撤销覆盖这些修改")
    ).toBeInTheDocument();
  });

  it("解析配音期间禁止打开旧草稿抽屉，完成后恢复编辑", async () => {
    let finish!: (value: []) => void;
    resolveProfiles.mockImplementationOnce(
      () =>
        new Promise<[]>((resolve) => {
          finish = resolve;
        })
    );
    render(<Harness />);
    fireEvent.click(
      within(screen.getByTestId("form-0")).getByRole("button", {
        name: "复制英美音标"
      })
    );
    fireEvent.click(screen.getByTestId("phonetics-1"));
    const edit = screen.getByRole("button", { name: "编辑词形内容" });
    expect(edit).toBeDisabled();
    expect(edit.closest("[inert]")).not.toBeNull();
    fireEvent.click(edit);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await act(async () => {
      finish([]);
    });
    expect(targetPronunciation().actual_pron).toBe("source");
    expect(edit).toBeEnabled();
    fireEvent.click(edit);
    expect(screen.getByRole("dialog")).toHaveTextContent("旧草稿抽屉");
  });

  it("音色解析失败或解析期间目标改变时，不产生部分修改", async () => {
    resolveProfiles.mockRejectedValueOnce(new Error("音色暂时不可用"));
    render(<Harness />);
    const source = within(screen.getByTestId("form-0")).getByRole("button", {
      name: "复制英美音色参数"
    });
    fireEvent.click(source);
    fireEvent.click(screen.getByTestId("voices-1"));
    await screen.findByText("音色暂时不可用");
    expect(targetPronunciation().actual_pron).toBe("target-0");
    let finish!: (value: []) => void;
    resolveProfiles.mockImplementationOnce(
      () =>
        new Promise<[]>((resolve) => {
          finish = resolve;
        })
    );
    fireEvent.click(source);
    fireEvent.click(screen.getByTestId("voices-1"));
    fireEvent.click(screen.getByRole("button", { name: "随后编辑目标" }));
    await act(async () => {
      finish([]);
    });
    expect(targetPronunciation().actual_pron).toBe("later-edit");
    expect(screen.getByText(/来源或目标.*变化/)).toBeInTheDocument();
  });
});
