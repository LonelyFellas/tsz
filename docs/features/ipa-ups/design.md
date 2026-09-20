# IPA / UPS 实现与兼容

## 基线

- 前端交付基线：origin/main `04ed6d3a27673050672755e92e02ead01a6aaed3`。
- 后端交付基线：origin/main `84cbd92e7cfcfd8f831fbf8f1d252b56e7daf54f`。
- 根据用户明确要求，从最新 main 创建独立交付 worktree；不使用或修改 dev。正式代码未保留 SAPI 新枚举/字段，harness 与实验归档不进入交付。

## 英美口音一致性修复（最新）

- IPA、UPS 分别保存可选 `ipa_locale` / `ups_locale`（en-GB|en-US），不能用一个共享 locale 自动重标另一候选。
- 固定英/美栏使用所属方言；common 使用当前个人偏好，页面与设置弹层显式展示当前口音。
- 通用栏旧候选未标口音时需主动确认或重新转换；不猜旧输入的口音。转换/手工编辑仅标记当前操作的候选。偏好改变保留输入与已记录口音，口音不匹配禁用试听。
- 后端 complete 校验拒绝固定英美栏与已记录口音不一致；新 common phoneme 来源需要明确候选口音。旧 JSON 缺少可选字段仍可读写草稿，不新增默认 locale。
- 正式试听根据目标 locale 过滤所有启用音色；只有错误口音音色时不自动改选其他音色。common 也不回退到其他 locale 的默认 voice。
- 切换口音或输入变为不可用时，停止旧音频/取消请求/释放缓存；下次试听使用新口音。
- 英式 UPS 自动转换仍未实现：明确说明并拒绝自动套美式映射；手工确认输入可以用英式音色试听。

## 正式实现

1. `packages/shared/src/ipa-ups.ts`：UPS S1/S2 音节前重音、点边界及英语基础音素/双元音映射；有源码注释链接。失败原子性，不删除长音等未覆盖记号。
2. `pronunciation-synthesis.ts`：从实际音标按词转换；生产 IPA 保留输入重音写法。UPS 候选和 metadata 一并返回；正文使用词形，元数据生成按 Unicode 码点定位的多条 phoneme annotation。
3. `V3SynthesisInputs`：正式组件，仅 IPA/UPS；固定来源、覆盖确认校验来源/口音/正文竞态、撤销与独立来源；保留 VoiceEditor 配置及录音能力。
4. `V3ActualPronunciationCopy`：字典填入实际发音的显式操作，确认覆盖、清除旧标注、支持恢复音标及标注。不是自动连读处理。
5. `model.ts`、review/publication history：识别新字段，预览与来源文案一致；旧缺失 synthesis 的历史预览仍保留原禁用行为。

## Wire 与存储

原 `alphabet: ipa|ups`、`ipa`、`ups` 不变。新增可选字段：

- `use_spelling?: boolean|null`：true 表示普通正文合成；false 显式选中 alphabet；旧缺省保持原 alphabet 行为。
- `ups_words?: {text:string, phoneme:string}[]|null`：最多 30 个，text ≤200、phoneme ≤1600。

新短语数据显式 use_spelling=false 时，完成校验必须确认 words 对齐当前拼写与 UPS 串；存草稿允许保留未对齐的候选，但非法结构/超限拒绝。旧无 use_spelling 的短语候选保持历史整段合成，不重解释或强制补元数据。修改候选进入新模式，失效边界要重新转换。

后端仅新增 DTO 与校验，原正式 UPS SSML/provider/cache 机制复用，无数据库 schema migration。serde 旧字段无新增值时省略新字段，旧记录读写结果保持原样。

OpenAPI 使用所选后端原生 export_openapi 生成；前端通过显式 OPENAPI_SOURCE 同步两份快照。当前输入 SHA256：`6ecdcf8e96ec6d36abb5743dab0dd913f585f778bfceab2fc545dd31632246e5`。

## 发布边界（未执行）

新字段虽可选，旧前端严格 schema 会拒绝含新字段的记录。因此建议先发布新 reader 且 `VITE_AZURE_PRONUNCIATION_INPUTS=false`，再发布匹配后端，最后打开 writer。旧客户端未刷新前不能声称混合版本安全。新前端不能向旧后端写新字段。当前仅在匹配的本地前后端组合下验收。

## 验证

- 前端全量普通测试：189 个文件，2851 passed、2 existing skipped。
- 前端 typecheck、lint、admin build 通过。
- 后端 all-features --lib：297 passed，使用本任务隔离 PG/Redis；fmt/clippy 通过。
- 已完成本地正式单词与短语保存回读、词界失效/撤销、来源持久化、正式 UPS 试听；本地账号、进程与试听证据留在开发环境，不纳入此提交。
- LSP 默认可选服务器不可用，使用原生 tsc/clippy 检查；没有以配置缺失替代验证。

未证明所有音素或音色的听感等价；测试词条保持本地草稿。本次仅交付提交与推送，不执行合并或部署。
