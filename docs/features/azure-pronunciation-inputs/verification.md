# 任务 54：实现与验证记录

日期：2026-09-15。前后端基线与工作区见 [design.md](design.md)。交付范围为两仓本地提交；未推送、创建 PR、合并或部署。

## 1. 已验证行为

| 风险                       | 证据                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------- |
| 拼写被误当作音标或反向混用 | shared 构造器测试；真实浏览器 POST 的正文为 `cat`，phoneme 为 `K AE T`，alphabet 为 `ups`                 |
| 切源/未选候选/旧回包       | 两套候选独立；单选不清值；VoiceEditor 的 synthesis 模式测试确认换源 dispose 旧回包、后续发送新的 alphabet |
| 转换覆盖人工输入           | 组件测试验证固定字典来源、只写目标、替换取消/应用/撤销、原始错误位置；UPS 不读人工 IPA                    |
| 草稿/完成差异              | 前后端测试：未选中内容可留草稿，选中空值在完成定位到 `synthesis.ups`；旧记录不回填                        |
| 字段丢失                   | frontend model/wire、共用转英美及差异合并测试；Rust 完整保存→GET→保存词义→发布→历史读取                   |
| 快照和 hash                | 新配置保存在新快照；只切换来源改变发音节点 hash；旧快照逐值不变                                           |
| 真人录音引用               | 真实上传接口登记测试 MP3，保存/重读保留；浏览器切到 UPS 保存再刷新，同一 asset id 仍展示                  |
| 兼容入口关闭               | 新输入与来源不可编辑，已有字段只读且原样保存；共享音色和录音入口仍可用                                    |
| 旧 reader 不兼容新字段     | 使用 main 的原 schema 与未改动的实际 runtime validator 执行对比，旧形状通过，新字段被旧 reader 拒绝       |

## 2. 自动检查

### 前端

- `pnpm typecheck`：全仓通过；收尾变动再跑 admin typecheck 通过。
- `pnpm lint`：全仓通过；收尾变动再跑 admin lint，修正 effect 依赖后通过。
- `pnpm test`：179 个文件，2698 项通过、6 项 5 秒超时失败、2 项原有跳过；未降低超时。
- 对超时的 `WordWizardV3`、`PartOfSpeechSettings`、`V3WordCreationWizard`、`V3FormsAndPronunciationStep` 四个文件使用 `--no-file-parallelism` 原样重跑：243 项通过、2 项原有跳过。全量运行当时同时有构建/浏览器任务；不能把首次全量记录称为一次全绿。
- `pnpm --filter @tsz/api-client test`：9 文件、395 项通过。
- 新增转换、模型、复制、面板、来源选择/撤销、旧请求取消、开关兼容与 env 用例按改动定向通过；具体命令与日志保留于本机 `/tmp/tsz-task54/`。
- `pnpm --filter @tsz/admin build`：生产构建通过，默认兼容 reader 配置（新输入入口关闭）。真实界面验收使用本任务 Vite dev，显式连接真实后端。

### 后端

- `SQLX_OFFLINE=true cargo test --locked --lib`：277 项通过，包含新增 synthesis 校验与 UPS SSML/长度/cache identity 测试。
- `cargo test --locked --test lexicon_handler v3_synthesis_survives_forms_meanings_publication_and_history`：真实 PostgreSQL/Redis 下通过。显式使用本任务 `55454/tsz_task54` 与 Redis `56454/0`；SQLx 测试自建测试库，不触碰其他任务业务数据。
- `SQLX_OFFLINE=true cargo clippy --locked --all-targets --all-features -- -D warnings`、`cargo fmt --check`、`git diff --check`：通过。
- 独立只读审查发现并修正旧 rich-text 控制字符收紧问题，以及生产关闭入口时隐藏音色/录音的回归。

### OpenAPI

生成命令：

```sh
# 本任务后端根目录
SQLX_OFFLINE=true cargo run --locked --all-features --bin export_openapi
# 本任务前端根目录
env -u SYNC_OPENAPI_RUNTIME_ONLY OPENAPI_SOURCE=/Users/darwish/Dev/tsz-core/tsz-rust-azure-pronunciation-inputs/docs/openapi.json pnpm --filter @tsz/api-client sync:openapi
```

spec SHA-256：`4ab216ca44138a0421788029ff7235220ef75bd9e1c26451ce2baef9e2323ef0`。
runtime bundle 的 `_source` 指向本任务后端，`_source_sha256` 与原 spec 匹配。
契约变化：可选 synthesis、新对象的严格字段/长度、phoneme alphabet 的 ups、新 RichTextV3 phoneme 最大长度；没有新增业务端点。

## 3. 真实环境与浏览器

| 组件       | 归属                                                                                          |
| ---------- | --------------------------------------------------------------------------------------------- |
| admin      | `http://127.0.0.1:3154`，PID `72853`，本任务 frontend worktree 的 Vite dev                    |
| backend    | `http://127.0.0.1:8454`，PID `77449`，本任务构建复制到 `/tmp/tsz-task54/backend-final` 后启动 |
| PostgreSQL | Docker `tsz-task54-pg`，`127.0.0.1:55454`，数据库 `tsz_task54`                                |
| Redis      | Docker `tsz-task54-redis`，`127.0.0.1:56454/0`                                                |
| OSS        | 从本地已有 speech 配置复用凭据，使用任务独立 speech/audio 根路径；不输出密钥或签名 URL        |

所有新服务均属本任务。原 8383/3100/3101 服务未被接管或重启，后端原主目录脏文件列表未改变。
`VITE_ADMIN_WORDS_MOCK`、`VITE_ADMIN_PART_OF_SPEECH_MOCK`、`VITE_ADMIN_TTS_MOCK` 显式 false，VoiceEditor/Preview/AudioUpload 开启；新输入在 dev 默认开启。没有 Playwright route 拦截业务响应。

浏览器使用任务专用管理员及测试 refresh 会话（隔离数据库种入），真实调用 refresh/profile。此流程验证编辑链路，不声称验收了短信登录。
任务 fixture：`cat`，词条 ID `01a0a572-496a-7700-a2d1-cb1e2a59378f`，最终保存来源 UPS。浏览器实际经历创建→添加名词→输入/转换→保存→刷新→试听；随后读取真实资产、切换来源保存及再次刷新。测试上传的 MP3 是合成音频样本，不将它宣称为真人录音内容；验证的是原“真人录音”上传资产通道的引用行为。

本机截图与脱敏证据保存在前端 `test-results/task54/`（git 忽略），包括 `final.png`、`recording-preserved.png`、`browser-evidence.json`、`browser-recording-evidence.json`、`compatibility.json`、`audio-upload-evidence.json`。

## 4. Azure 与上传结果

真实 Azure（非 mock）：

| locale / voice            | IPA | UPS    | 结果                                          |
| ------------------------- | --- | ------ | --------------------------------------------- |
| en-GB / en-gb-sonianeural | kæt | K AE T | 各生成 22464 字节 MP3，实际取回，分别记录缓存 |
| en-US / en-us-arianeural  | kæt | K AE T | 各生成 22464 字节 MP3，实际取回，分别记录缓存 |

MP3 经系统音频工具识别为单声道 24kHz、96kbps、约 1.872 秒；四份文件 hash 各不相同。文件在 `test-results/task54/en-GB-ipa.mp3` 等位置。
这些证据证明实际服务接线、可解码音频及缓存区分，**不证明完整音素表或主观听感已通过**。本轮尚未完成人工逐例审听；多词/复杂重音等也未完成实际语音准确性验收。

浏览器向 OSS 直传的预检返回 **403 AccessForbidden / CORSResponse**，不允许当前本地 origin/method/headers 组合；没有修改云端 CORS。
HTTP 直接 PUT 测试样本为 200，后端 confirm 为 201；保存/重读和浏览器切源后 asset id 均保留。故可确认引用通道未被切源删除，但不能声称本地浏览器上传已完整通过。

## 5. 实际兼容矩阵与限制

| 组合                     | 证据/结论                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------- |
| 旧 reader + 旧形状       | 原 runtime validator + main schema 通过                                                 |
| 新 reader + 旧形状       | 同一真实响应移除新增可选字段后通过；旧后端可继续返回旧形状                              |
| 新 reader + 新 synthesis | 实际保存响应通过                                                                        |
| 旧 reader + 新 synthesis | 原 main schema 实际拒绝：`$.forms.pos[0].forms[0].regional_variants` / `no_union_match` |
| 旧后端 + 新字段          | 旧 DTO `deny_unknown_fields` 确认不兼容；未向共享旧服务发写入请求                       |
| 新后端 + 旧数据          | 生命周期测试先发布无 synthesis 记录成功，后续新数据不改写旧快照                         |

尚未执行上线切换；长开旧编辑会话必须在启用写入口前刷新/结束。出现新数据后不能降级到完全不认识字段的旧前后端。

## 6. 未完成与环境收尾

- 完整业务转换规则未定稿，当前只有文档列明的确定性子集；未知/歧义明确定位失败，不用猜测映射或空实现充数。
- 全部目标音素、英美差异、复杂重音/音节和多词拼写需要扩展已知期望样例并人工审听。
- 本地浏览器直传需单独处理现有 OSS CORS，属于环境配置；本任务未改云端权限。
- 服务保留供本地复核。仅可停止本任务 PIDs/容器；清理时先核实身份。配置与测试会话在后端 git-ignored `.env` 和 `/tmp/tsz-task54/`，不进入提交。
- 对象存储测试文件在任务独立根路径；数据库有本任务词条与测试上传资产。不要用共享库清空、批量删 bucket 或停止其他服务作为清理方式。

## CI 跟进：父组件测试边界

前端 PR CI run `34986327873` 的 admin-1/admin-2 分片共有 14 项 5 秒超时，集中在词形矩阵与步骤定位；其他质量、契约和 e2e 检查通过。矩阵测试改为隔离独立音素编辑面板，仍保留真实 `PronunciationPreviewControls` 和播放入口数量等全部原断言；向导定位测试保留实际发音字段，音素控件由专用 `V3PronunciationList` / `VoiceEditor` 测试及上述真实浏览器验收覆盖。没有修改业务代码、超时、覆盖率设置或跳过用例。

同一覆盖率配置下重跑两个父组件文件：163 项通过（50.97 秒）；等待修复提交的远端 CI 复验。
