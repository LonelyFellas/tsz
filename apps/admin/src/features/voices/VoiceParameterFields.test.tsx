import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { Button } from "@tsz/ui/admin/display";
import { Form } from "@tsz/ui/admin/forms";
import type { AdminSpeechVoice } from "@tsz/types";
import { afterEach, expect, it, vi } from "vitest";
import {
  VoiceParameterFields,
  defaultVoiceParameters,
  type VoiceParameterValues
} from "./VoiceParameterFields";
import { styleNames } from "./voice-labels";

const voice: AdminSpeechVoice = {
  alias: "sonia",
  display_name: "Sonia",
  locale: "en-GB",
  gender: "female",
  is_common: true,
  capabilities: {
    styles: ["cheerful"],
    min_rate_percent: -50,
    max_rate_percent: 50,
    min_pitch_semitones: -10,
    max_pitch_semitones: 10
  },
  capability_evidence: {
    provider_voice_id: "en-GB-SoniaNeural",
    locale: "en-GB",
    gender: "female",
    model: "neural",
    styles: ["cheerful"],
    supported_locales: ["en-GB"],
    roles: ["Girl"],
    supports_style_degree: true,
    source_url: "fixture",
    checked_at: "2026-11-02"
  }
};
function Harness({
  target,
  initial,
  onSave
}: {
  target: AdminSpeechVoice;
  initial: VoiceParameterValues;
  onSave: (values: VoiceParameterValues) => void;
}) {
  const [form] = Form.useForm<VoiceParameterValues>();
  const values = Form.useWatch<VoiceParameterValues>([], form);
  return (
    <Form
      form={form}
      layout="vertical"
      requiredMark={false}
      initialValues={initial}
      onFinish={onSave}
    >
      <VoiceParameterFields
        voice={target}
        disabled={false}
        volume={values?.volume_percent}
        style={values?.style}
        resetDisabled={false}
        onReset={() => form.setFieldsValue(defaultVoiceParameters(target))}
      />
      <Button htmlType="submit">应用参数</Button>
    </Form>
  );
}
function mount(target = voice, initial = defaultVoiceParameters(target)) {
  const onSave = vi.fn();
  render(<Harness target={target} initial={initial} onSave={onSave} />);
  return onSave;
}
afterEach(() => cleanup());
it("未支持高级项时说明原因并置灰控件", async () => {
  mount({ ...voice, capability_evidence: undefined });
  expect(screen.getByRole("region", { name: "其他参数" })).toBeVisible();
  expect(await screen.findByText("此音色没有可调的高级参数。")).toBeVisible();
  expect(screen.getByRole("spinbutton", { name: "风格强度" })).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "角色" })).toBeDisabled();
});
it("常用及其他参数直接展开，选定风格后启用可调项并提交准确设置", async () => {
  const onSave = mount();
  expect(screen.getByRole("region", { name: "其他参数" })).toBeVisible();
  expect(
    await screen.findByText("先选择说话风格，再调节高级参数。")
  ).toBeVisible();
  expect(screen.getByRole("spinbutton", { name: "风格强度" })).toBeDisabled();
  fireEvent.mouseDown(screen.getByLabelText("说话风格"));
  fireEvent.click(
    await screen.findByText(styleNames.cheerful ?? "cheerful", {
      selector: ".ui-select-item-option-content"
    })
  );
  const degree = await screen.findByRole("spinbutton", { name: "风格强度" });
  expect(degree).toBeEnabled();
  fireEvent.change(degree, { target: { value: "1.40" } });
  fireEvent.mouseDown(screen.getByLabelText("角色"));
  fireEvent.click(
    await screen.findByText("Girl", {
      selector: ".ui-select-item-option-content"
    })
  );
  fireEvent.click(screen.getByRole("button", { name: "应用参数" }));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        style: "cheerful",
        style_degree: 1.4,
        role: "Girl"
      })
    )
  );
});
it("不支持的已有高级值仍只读展示，修改基础参数不丢值", async () => {
  const target = { ...voice, capability_evidence: undefined };
  const initial = {
    ...defaultVoiceParameters(target),
    style_degree: 1.3,
    role: "Girl"
  };
  const onSave = mount(target, initial);
  expect(screen.getByRole("region", { name: "其他参数" })).toBeVisible();
  const degree = await screen.findByRole("spinbutton", { name: "风格强度" });
  expect(degree).toBeDisabled();
  expect(degree).toHaveValue("1.30");
  expect(screen.getByLabelText("角色")).toBeDisabled();
  fireEvent.change(screen.getByLabelText("合成音量"), {
    target: { value: "65" }
  });
  fireEvent.click(screen.getByRole("button", { name: "应用参数" }));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        volume_percent: 65,
        style_degree: 1.3,
        role: "Girl"
      })
    )
  );
  expect(initial.style_degree).toBe(1.3);
});
