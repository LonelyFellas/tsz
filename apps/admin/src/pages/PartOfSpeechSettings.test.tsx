import { fireEvent, render, screen } from "@testing-library/react";
import { App as AntApp } from "antd";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PartOfSpeechSettingsPage } from "./PartOfSpeechSettings";

const auth = vi.hoisted(() => ({ isSuperAdmin: true }));

vi.mock("@/lib/auth", () => ({
  useIsSuperAdmin: () => auth.isSuperAdmin
}));

vi.mock("@/features/dictionary/part-of-speech/PartOfSpeechSettings", () => ({
  PartOfSpeechSettings: () => <div>词性配置管理内容</div>
}));

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/settings/parts-of-speech"]}>
      <AntApp>
        <PartOfSpeechSettingsPage />
        <LocationProbe />
      </AntApp>
    </MemoryRouter>
  );
}

beforeEach(() => {
  auth.isSuperAdmin = true;
});

describe("PartOfSpeechSettingsPage", () => {
  it("超级管理员可进入词性配置管理内容", () => {
    renderPage();
    expect(screen.getByText("词性配置管理内容")).toBeInTheDocument();
  });

  it("普通管理员直达显示 403，并可返回首页", () => {
    auth.isSuperAdmin = false;
    renderPage();

    expect(screen.getByText("无权限")).toBeInTheDocument();
    expect(screen.getByText("词性配置仅超级管理员可访问。")).toBeVisible();
    fireEvent.click(screen.getByText("返回首页"));
    expect(screen.getByTestId("location")).toHaveTextContent("/");
  });
});
