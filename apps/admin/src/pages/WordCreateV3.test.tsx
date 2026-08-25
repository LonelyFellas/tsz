import { fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import type { V3CreateEntryStep } from "@/features/dictionary/word-creation-v3/V3CreateEntryStep";

const wired = vi.hoisted(() => ({
  props: undefined as ComponentProps<typeof V3CreateEntryStep> | undefined
}));

vi.mock("@/features/dictionary/word-creation-v3/V3CreateEntryStep", () => ({
  V3CreateEntryStep: (props: ComponentProps<typeof V3CreateEntryStep>) => {
    wired.props = props;
    return (
      <button
        type="button"
        onClick={() => props.onCreated({ id: "created-v3" } as never)}
      >
        完成 V3 创建
      </button>
    );
  }
}));

import type { V3WordRequests } from "@/features/dictionary/word-creation-v3/api";
import { WordCreateV3Page } from "./WordCreateV3";

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

describe("WordCreateV3Page", () => {
  it("uses the V3 request boundary and replaces into the V3 forms route", () => {
    const requests = { create: vi.fn() } as unknown as V3WordRequests;
    render(
      <MemoryRouter initialEntries={["/words/new/v3"]}>
        <Routes>
          <Route
            path="/words/new/v3"
            element={<WordCreateV3Page requests={requests} />}
          />
          <Route
            path="/words/:wordId/v3/wizard/:step"
            element={<div>v3-wizard-target</div>}
          />
        </Routes>
        <LocationProbe />
      </MemoryRouter>
    );

    expect(wired.props?.requests).toBe(requests);
    fireEvent.click(screen.getByText("完成 V3 创建"));

    expect(screen.getByText("v3-wizard-target")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/words/created-v3/v3/wizard/forms"
    );
  });
});
