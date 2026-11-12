import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import type { InterfaceLocale } from "@tsz/shared/i18n";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App } from "@tsz/ui/admin/overlays";
import { Button } from "@tsz/ui/admin/display";
import { AdminControls } from "@tsz/ui/admin/context";
import { Table } from "@tsz/ui/admin/table";
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
          <div
            {...copy.cell(form.id, "phonetics")}
            data-testid={`phonetics-paired-${index}`}
          >
            另一口音的音标 {index}
          </div>
          <div
            {...copy.cell(form.id, "voices")}
            data-testid={`voices-paired-${index}`}
          >
            音色参数 {index}
          </div>
        </div>
      ))}
    </>
  );
}
function Harness({
  initial = fixture(),
  disabled = false
}: {
  initial?: SharedFormsStepContentV3;
  disabled?: boolean;
}) {
  const [forms, setForms] = useState(initial);
  return (
    <App>
      <AdminControls componentDisabled={disabled}>
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
      </AdminControls>
    </App>
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
  it("实际表格关闭整行 hover 时仍能高亮复制区域", () => {
    const forms = fixture();
    function TableCells() {
      const copy = useV3FormCopy()!;
      return (
        <Table
          rowHoverable={false}
          pagination={false}
          rowKey="id"
          dataSource={forms.pos[0]!.forms}
          columns={[
            {
              onCell: (form) => copy.cell(form.id, "phonetics"),
              render: (_, form) => form.id
            }
          ]}
        />
      );
    }
    render(
      <App>
        <V3FormCopyProvider forms={forms} onChange={vi.fn()}>
          <TableCells />
        </V3FormCopyProvider>
      </App>
    );
    const cell = screen.getByText(forms.pos[0]!.forms[0]!.id).closest("td")!;
    fireEvent.pointerEnter(cell);
    expect(cell).toHaveClass("is-copy-hovered");
    fireEvent.pointerLeave(cell);
    expect(cell).not.toHaveClass("is-copy-hovered");
  });

  it("悬停按词形和复制类型高亮整组，切换区域或离开后恢复", () => {
    render(<Harness />);
    const phonetics = screen.getByTestId("phonetics-0");
    const paired = screen.getByTestId("phonetics-paired-0");
    const voices = screen.getByTestId("voices-0");
    fireEvent.pointerEnter(phonetics);
    expect(phonetics).toHaveClass("is-copy-hovered");
    expect(paired).toHaveClass("is-copy-hovered");
    expect(voices).not.toHaveClass("is-copy-hovered");
    expect(screen.getByTestId("phonetics-1")).not.toHaveClass(
      "is-copy-hovered"
    );
    fireEvent.pointerLeave(phonetics);
    fireEvent.pointerEnter(voices);
    expect(phonetics).not.toHaveClass("is-copy-hovered");
    expect(paired).not.toHaveClass("is-copy-hovered");
    expect(voices).toHaveClass("is-copy-hovered");
    expect(screen.getByTestId("voices-paired-0")).toHaveClass(
      "is-copy-hovered"
    );
    fireEvent.pointerLeave(voices);
    expect(voices).not.toHaveClass("is-copy-hovered");
    expect(screen.getByTestId("voices-paired-0")).not.toHaveClass(
      "is-copy-hovered"
    );
  });

  it("空闲时继承页面保存期间的禁用状态", () => {
    const forms = fixture();
    render(
      <AdminControls componentDisabled>
        <App>
          <V3FormCopyProvider forms={forms} onChange={vi.fn()}>
            <Cells forms={forms} />
            <EditProbe />
          </V3FormCopyProvider>
        </App>
      </AdminControls>
    );
    expect(screen.getByRole("button", { name: "编辑词形内容" })).toBeDisabled();
    for (const button of screen.getAllByRole("button", {
      name: "复制英美音标"
    }))
      expect(button).toBeDisabled();
    fireEvent.pointerEnter(screen.getByTestId("phonetics-0"));
    expect(screen.getByTestId("phonetics-0")).not.toHaveClass(
      "is-copy-hovered"
    );
  });

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
    fireEvent.click(await screen.findByRole("button", { name: "撤销" }));
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
    fireEvent.click(within(dialog).getByRole("button", { name: /^取\s*消$/ }));
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

  it("同名目标用序号区分，通知精简展示目标和生效方式", async () => {
    const initial = fixture();
    initial.pos[0]!.forms[1]!.form_type = "base";
    const regions = initial.contents[1]!.regional_variants;
    if (regions.mode !== "common") throw new Error("fixture");
    regions.common.spelling = "read";
    render(<Harness initial={initial} />);
    begin();
    expect(screen.getByText(/正在复制“原形 1 · read”/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("phonetics-1"));
    expect(
      await screen.findByText(
        "目标：原形 2 · read。保存草稿后生效，请重新试听。"
      )
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(current()).toEqual(initial);
  });

  it("复制成功通知在 10 秒后关闭，复制结果保留", async () => {
    render(<Harness />);
    begin();
    fireEvent.click(screen.getByTestId("phonetics-1"));
    await screen.findByRole("button", { name: "撤销" });
    expect(
      screen.getByText("英美音标已复制").closest(".ui-notification-notice")
    ).not.toBeNull();
    await waitFor(
      () =>
        expect(
          screen.queryByRole("button", { name: "撤销" })
        ).not.toBeInTheDocument(),
      { timeout: 12000 }
    );
    expect(targetPronunciation().actual_pron).toBe("source");
  }, 15000);

  it("通知出现后页面锁定时不可撤销，解锁后才允许改回草稿", async () => {
    const initial = fixture();
    const view = render(<Harness initial={initial} />);
    begin();
    fireEvent.click(screen.getByTestId("phonetics-1"));
    await screen.findByRole("button", { name: "撤销" });
    view.rerender(<Harness initial={initial} disabled />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "撤销" })).toBeDisabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(targetPronunciation().actual_pron).toBe("source");
    view.rerender(<Harness initial={initial} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "撤销" })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole("button", { name: "撤销" }));
    expect(current()).toEqual(initial);
  });

  it("选择复制目标后打开只读参考状态，键盘和点击都不能改写草稿", async () => {
    const initial = fixture();
    const view = render(<Harness initial={initial} />);
    begin();
    fireEvent.keyDown(screen.getByTestId("phonetics-0"), { key: "ArrowDown" });
    view.rerender(<Harness initial={initial} disabled />);
    fireEvent.keyDown(screen.getByTestId("phonetics-1"), { key: "Enter" });
    fireEvent.click(screen.getByTestId("phonetics-1"));
    expect(resolveProfiles).not.toHaveBeenCalled();
    expect(current()).toEqual(initial);
    view.rerender(<Harness initial={initial} />);
    fireEvent.keyDown(screen.getByTestId("phonetics-1"), { key: "Enter" });
    await waitFor(() =>
      expect(targetPronunciation().actual_pron).toBe("source")
    );
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
    const target = screen.getByTestId("phonetics-1");
    fireEvent.pointerEnter(target);
    expect(target).toHaveClass("is-copy-hovered");
    fireEvent.click(target);
    expect(target).not.toHaveClass("is-copy-hovered");
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

it("复制请求中切换语言保留源目标和结果，完成后仍可撤销且不重发复制", async () => {
  let finish!: (value: []) => void;
  resolveProfiles.mockImplementationOnce(
    () =>
      new Promise<[]>((resolve) => {
        finish = resolve;
      })
  );
  const initial = fixture();
  const content = (locale: InterfaceLocale) => (
    <InterfaceI18nProvider locale={locale}>
      <Harness initial={initial} />
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  fireEvent.click(
    within(screen.getByTestId("form-0")).getByRole("button", {
      name: "复制英美音标"
    })
  );
  fireEvent.click(screen.getByTestId("phonetics-1"));
  const before = structuredClone(current());
  view.rerender(content("en-US"));
  expect(resolveProfiles).toHaveBeenCalledOnce();
  expect(current()).toEqual(before);
  expect(screen.getByRole("button", { name: "编辑词形内容" })).toBeDisabled();
  await act(async () => finish([]));
  expect(targetPronunciation().actual_pron).toBe("source");
  expect(current().pos).toEqual(before.pos);
  view.rerender(content("zh-Hant"));
  expect(targetPronunciation().actual_pron).toBe("source");
  const undo = await screen.findByRole("button", { name: "撤銷" });
  fireEvent.click(undo);
  expect(current()).toEqual(before);
  expect(resolveProfiles).toHaveBeenCalledOnce();
});
