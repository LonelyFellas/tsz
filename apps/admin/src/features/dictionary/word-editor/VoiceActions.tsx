import { SoundOutlined, SyncOutlined, UploadOutlined } from "@ant-design/icons";
import { App, Button, Space, Tooltip } from "antd";

// —— 复用的行内「语音」操作按钮组：试听 / 获取语音 / 上传语音（当前均为 Mock 占位）。——
// 后端就绪后把 onClick 换成真实调用即可，调用处无需改动。
export function VoiceActions() {
  const { message } = App.useApp();
  return (
    <Space size={2}>
      <Tooltip title="试听">
        <Button
          type="text"
          size="small"
          icon={<SoundOutlined />}
          onClick={() => message.info("试听（Mock）")}
        />
      </Tooltip>
      <Tooltip title="获取语音">
        <Button
          type="text"
          size="small"
          icon={<SyncOutlined style={{ color: "#0071e3" }} />}
          onClick={() => message.info("获取语音（Mock）")}
        />
      </Tooltip>
      <Tooltip title="上传语音">
        <Button
          type="text"
          size="small"
          icon={<UploadOutlined />}
          onClick={() => message.info("上传语音（Mock）")}
        />
      </Tooltip>
    </Space>
  );
}
