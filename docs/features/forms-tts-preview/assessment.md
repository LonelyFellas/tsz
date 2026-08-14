# 词形与发音 TTS 试听接线评估

## 范围与数据决策

- 本任务只把词形读音行接到现有临时 TTS 试听能力；上传与正式音频持久化不在范围内。
- 合成文本取当前 `WordFormVariantV2.spelling`。原形 spelling 从 headword 派生，派生词形使用自己的 spelling；`dict_phonetic` 与 `actual_pron` 仅是发音元数据，不直接作为普通朗读文本。
- 临时试听按稳定 `WordPronunciationV2.id` 归属，并同时绑定 spelling、voice 与 locale。任一输入变化都取消在途请求并使旧结果失效。
- `uk` 优先选择 `en-GB` voice，`us` 优先选择 `en-US` voice，`common` 使用 voice 目录默认项；目标 locale 无可用 voice 时安全禁用并提示，不跨方言冒用。
- V2 pronunciation wire 不包含 `audio_url/audio_source`；旧数据中的这两个字段只读保留且保存时剥离。试听 URL 是短期签名 URL，只存在组件状态，不写回词条。
- 复用 `adminVoicePreviewAdapter`，继承现有真实/Mock 数据源切换、错误映射、409 短重试和 AbortSignal 语义。生成成功后与高级编辑器一致地尝试自动播放；自动播放被拒绝时仍保留可手动重播的结果。

## 测试用例矩阵

| #   | 层            | 场景                        | 输入/前置                                                  | 预期                                                      | 优先级 |
| --- | ------------- | --------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- | ------ |
| 1   | 契约/现有回归 | voices 与 preview wire      | `GET /speech/voices`、snake_case preview body、AbortSignal | method/path/body/signal 与现有契约一致                    | P0     |
| 2   | 组件集成      | tomato 原形成功获取并播放   | spelling=`tomato`，common pronunciation，目录默认 voice    | 请求 RichText 文本 `tomato`；成功后自动播放且播放按钮可用 | P0     |
| 3   | 组件集成      | 派生词形使用自己的 spelling | spelling=`tomatoes`，IPA/actual_pron 为其他值              | 合成正文是 `tomatoes`，不是 IPA/actual_pron               | P0     |
| 4   | 组件集成      | 英美 locale/voice           | UK/US pronunciation，目录含 en-GB/en-US voice              | 各自使用匹配 locale 的 voice alias                        | P0     |
| 5   | 组件集成      | 内容变化使旧音频失效        | 已生成后修改 spelling                                      | 旧音频停止/释放，播放禁用并提示重新生成                   | P0     |
| 6   | 组件集成      | voice 目录或合成失败后重试  | 首次 reject，随后 resolve                                  | 显示安全错误；按钮恢复；再次点击可成功                    | P0     |
| 7   | 组件集成      | 重复点击                    | synthesize promise 未完成                                  | loading 且同一行不可重复触发                              | P0     |
| 8   | 组件集成      | URL 过期                    | `expiresAt` 到时                                           | 停止/释放旧结果，播放禁用，提示重新生成                   | P0     |
| 9   | 组件集成      | 功能开关关闭                | `VITE_VOICE_PREVIEW=false`                                 | 获取与播放禁用，不调用 adapter、不显示假成功              | P0     |
| 10  | 组件集成      | 只读模式                    | `readOnly=true`                                            | 获取、播放和上传均不可操作，不调用 adapter                | P0     |
| 11  | 组件集成      | 卸载/输入变化取消           | list/synthesize 在途                                       | AbortSignal 被触发；迟到结果被释放且不更新 UI             | P0     |
| 12  | 组件集成      | 自动播放被拒绝              | `Audio.play()` reject                                      | 结果仍可重播；状态提示用户手动播放                        | P0     |
| 13  | 组件集成      | 重播失败/音频加载错误       | 手动播放 reject 或 error 事件                              | 显示可理解提示；加载错误时丢弃失效结果                    | P0     |
| 14  | 组件集成      | 空 spelling/无匹配 voice    | 空文本或 UK/US voice 缺失                                  | 获取安全禁用并说明原因，不发请求                          | P0     |
| 15  | 手测          | 真后端浏览器冒烟            | 测试服配置或本地可用 Rust/API、已登录 admin                | voices 与 preview 成功，实际可听，过期/重生成交互正常     | 手测   |

## 验证边界

- 自动化覆盖组件状态机与现有 API/adapter 契约；不新增第二套底层 HTTP 请求。
- 真 Azure、对象存储签名 URL 与浏览器实际解码依赖可用后端、凭据和登录态，无法安全满足时作为未验证项明确报告。
