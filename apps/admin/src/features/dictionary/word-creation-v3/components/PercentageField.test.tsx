import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { expect, it } from "vitest";
import { PercentageField } from "./PercentageField";
it("区分空值与零，保留小数输入，失焦收敛范围与精度并支持方向键", () => {
  function Harness() {
    const [value, setValue] = useState<number | null>(null);
    return (
      <>
        <PercentageField
          value={value}
          onChange={setValue}
          ariaLabel="频率"
          nodeId="sense"
          field="frequency"
          step={0.01}
        />
        <output data-testid="value">{value === null ? "空" : value}</output>
      </>
    );
  }
  render(<Harness />);
  const input = screen.getByRole("spinbutton", { name: "频率" });
  fireEvent.change(input, { target: { value: "0" } });
  expect(screen.getByTestId("value")).toHaveTextContent("0");
  fireEvent.change(input, { target: { value: "0." } });
  expect(input).toHaveValue("0.");
  fireEvent.change(input, { target: { value: "99.999" } });
  fireEvent.blur(input);
  expect(input).toHaveValue("100");
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(screen.getByTestId("value")).toHaveTextContent("99.99");
  fireEvent.change(input, { target: { value: "" } });
  expect(screen.getByTestId("value")).toHaveTextContent("空");
});
