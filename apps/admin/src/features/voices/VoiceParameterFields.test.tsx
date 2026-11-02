import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { Button, ConfigProvider, Form } from "antd";
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
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <Harness target={target} initial={initial} onSave={onSave} />
    </ConfigProvider>
  );
  return onSave;
}
afterEach(() => cleanup());
it("未支持高级项时说明原因，不展示无效空控件", async () => {
  mount({ ...voice, capability_evidence: undefined });
  fireEvent.click(screen.getByText("高级参数", { exact: true }));
  expect(await screen.findByText("此音色没有可调的高级参数。")).toBeVisible();
  expect(screen.queryByRole("spinbutton", { name: "风格强度" })).toBeNull();
  expect(screen.queryByRole("combobox", { name: "角色" })).toBeNull();
});
it("选定风格后渐进展示可调项，并提交准确设置", async () => {
  const onSave = mount();
  fireEvent.click(screen.getByText("高级参数", { exact: true }));
  expect(
    await screen.findByText("先选择说话风格，再调节高级参数。")
  ).toBeVisible();
  expect(screen.queryByRole("spinbutton", { name: "风格强度" })).toBeNull();
  fireEvent.mouseDown(screen.getByLabelText("说话风格"));
  fireEvent.click(
    await screen.findByText(styleNames.cheerful ?? "cheerful", {
      selector: ".ant-select-item-option-content"
    })
  );
  const degree = await screen.findByRole("spinbutton", { name: "风格强度" });
  expect(degree).toBeEnabled();
  fireEvent.change(degree, { target: { value: "1.40" } });
  fireEvent.mouseDown(screen.getByLabelText("角色"));
  fireEvent.click(
    await screen.findByText("Girl", {
      selector: ".ant-select-item-option-content"
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
  fireEvent.click(screen.getByText("高级参数", { exact: true }));
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
