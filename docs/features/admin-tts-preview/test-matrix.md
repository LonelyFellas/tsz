# 管理端 TTS 试听测试矩阵

| ID  | 层   | 场景               | 输入/前置                        | 预期                                               | 优先级 |
| --- | ---- | ------------------ | -------------------------------- | -------------------------------------------------- | ------ |
| P01 | 契约 | speech 路径与 wire | mock HttpClient                  | GET/POST 路径、signal、snake_case body 精确一致    | P0     |
| P02 | 单元 | 请求字段白名单     | RichTextV2 + 全部设置            | 无 SSML/provider id/hash/object key/audio/url 字段 | P0     |
| P03 | 单元 | voice 目录与能力   | 多 locale/gender/range/styles    | alias 映射且不暴露 provider id；能力完整           | P0     |
| P04 | 组件 | 能力联动           | 切换能力不同的 voice             | 非法 style/rate/pitch 被清理且不可选择             | P0     |
| P05 | 组件 | generated/hit/播放 | 两类成功响应                     | 状态区分并使用当次 URL 播放                        | P0     |
| P06 | 组件 | TTL 到期           | expires_at 到期                  | 停播、清 URL 状态、重播禁用、允许重新生成          | P0     |
| P07 | 组件 | 音频失败           | Audio error/play reject          | 清旧 URL，显示安全提示并允许重新生成               | P0     |
| P08 | 组件 | 快速双击           | pending synthesize               | 仅一个请求                                         | P0     |
| P09 | 组件 | stale response     | pending 时切 voice/style/content | abort/忽略旧响应，不覆盖新选择                     | P0     |
| P10 | 单元 | 409 有界重试       | `speech_preview_in_progress`     | 短暂退避，最多三次请求，成功可返回                 | P0     |
| P11 | 单元 | 400/404/422        | RFC 9457 mock                    | 不可重试安全提示，不展示响应正文                   | P0     |
| P12 | 单元 | 429/503            | RFC 9457 mock                    | 可手动重试安全提示                                 | P0     |
| P13 | 集成 | 401/403            | HttpClient mock                  | 沿用全局鉴权处理，不泄漏正文                       | P0     |
| P14 | 组件 | 空/非法 RichText   | 空白或 normalize 失败            | 不发送请求并展示校验状态                           | P0     |
| P15 | 组件 | 卸载清理           | pending/audio/timer 存在         | abort、pause、释放状态，无卸载后更新               | P0     |
| P16 | 组件 | 可访问与窄屏       | 键盘/语义查询、窄视口            | 控件有名称、状态可感知、Flex 可换行                | P0     |

手测：在测试服登录 admin，验证真实 voice 目录、首次 generated/再次 hit、URL 200 `audio/mpeg`、约 300 秒到期后重生；Chrome/Safari 验证自动播放策略。自动化禁止调用真实 Azure/OSS。
