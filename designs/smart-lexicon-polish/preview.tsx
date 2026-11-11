import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../../packages/ui/src/admin/tokens.css";
import "../../apps/admin/src/globals.css";
import "./preview.css";

function Preview() {
  const [mode, setMode] = useState("有数据");
  const [width, setWidth] = useState("100%");
  const query = new URLSearchParams(window.location.search);
  query.set("scenario", mode);
  return (
    <>
      <aside className="preview-controls" aria-label="预览设置">
        <strong>本地样例预览</strong>
        <label>
          数据状态{" "}
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value)}
          >
            {["有数据", "无数据", "请求失败"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <label>
          视口宽度{" "}
          <select
            value={width}
            onChange={(event) => setWidth(event.target.value)}
          >
            <option value="100%">自适应</option>
            <option value="1440px">1440px</option>
            <option value="768px">768px</option>
            <option value="390px">390px</option>
          </select>
        </label>
      </aside>
      <div className="preview-stage">
        <iframe
          className="preview-frame"
          title="智能词库页面预览"
          src={`./frame.html?${query}`}
          style={{ width }}
        />
      </div>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
