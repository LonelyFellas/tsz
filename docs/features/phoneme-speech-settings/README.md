# Step 2：IPA / UPS 独立停顿与音色

2026-10-16。依据用户提供的两张原型及后续转换来源说明，用户已确认四份配置独立保存。本文件为跨仓主记录。

## 范围与验收

- 实际发音正文可编辑，标注仅连读，仍只用于展示。
- 字典音标 → 实际发音；字典音标 → Azure IPA；当前对应口音的 Azure IPA → Azure UPS。修改实际发音不能改变音素转换或试听，UPS 使用人工修订后的 IPA，不重新套用字典规则。
- IPA 转换移除字典括号等包围符号；其他无法确定的音素继续给出具体错误，不静默猜测读音。
- UPS 按钮遇到当前 IPA 中的字典记法 `r` 时，仅在改为 `ɹ` 后能通过严格转换的情况下展示确认；应用后同步更新同侧 IPA、UPS 与逐词边界，可分别撤销。取消或确认期间来源/目标变化均不写回；严格转换函数仍拒绝原始 `r`。
- 英式 IPA、美式 IPA、英式 UPS、美式 UPS 各自提供左侧试听、右侧转换和设置入口。音素正文继续在外部输入框编辑。
- TTS 设置器只包含停顿、音色及其语速，不提供连读、文本格式、语法分类或上传工具。画布使用词形拼写定位合法词缝，禁止将 UPS 音素空格视为词界。
- 四份设置分别保存；设置器内试听使用草稿，完成应用，取消不写回。字段左侧与发布预览试听使用对应已完成配置；选择词形拼写作为合成来源时不借用 IPA/UPS 设置。
- 保存后独立 GET、刷新重新打开完整保留；旧客户端正常保存不能丢失未读取的配置。普通拼写改字迁移停顿，失效词界沿用原有校验反馈。

## 依赖与实现

已在主线：字典转换规则、英美独立候选、IPA/UPS 输入与试听、音色面板和停顿编辑。可复用：编辑器草稿、只读正文、Modal、保存与发布快照。新增：四份配置契约、逐字段设置入口、合成停顿组合和旧客户端兼容。

前端 `/Users/darwish/.codex/worktrees/63bb/tsz`，分支 `codex/actual-pronunciation-requirements`，基线 `cd8e1e01`。
后端 `/Users/darwish/.codex/worktrees/phoneme-speech/tsz-rust`，分支 `codex/phoneme-speech-settings`，基线 `bd9010b`。

`PronunciationSynthesisCandidateV3` 新增可选、不可为 null 的 `ipa_speech`、`ups_speech`，分别位于 `synthesis.uk`、`synthesis.us` 下：

```ts
interface SynthesisSpeechV3 {
  content: RichTextV2V3; // 正文等于 owning variant.spelling，仅允许合法 pause
  voice_profile: VoiceProfileV3;
}
```

复用 forms 保存与快照，无数据库 migration。正文不一致、非停顿注解、非法位置/时长或音色配置必须拒绝，并定位 `synthesis.<side>.<alphabet>_speech`。

旧数据没有配置时沿用现有试听行为；首次编辑时复制旧音色为起始值，此后每份独立。空 annotations 与空 voices 是显式清除；省略不是清除指令。
旧页面省略配置且 variant ID、方言、pronunciation ID、拼写和对应音素未变化时保留原配置；拼写或对应音素改变时不继承未读取的配置。

暂停不写入 IPA/UPS 字符串。合成 IPA 短语带停顿时，按空格对齐拼写的逐词音标并生成逐词 phoneme；UPS 必须使用已有 ups_words 元数据，不推断音素词界。词界不匹配时禁止试听并提示修正。

## 兼容与发布

- 使用独立能力头 `X-TSZ-Phoneme-Speech: v1`，13 个完整词条响应入口沿用现有投影路径；缺省/未知值隐藏新增配置。仅投影返回副本，不改变存储、不可变发布快照或幂等结果。Vary 包含该能力头。
- 旧前端 + 新后端：获得旧 strict schema 可解析的数据；同输入保存保留已有配置。
- 新前端 + 旧后端：可读取旧数据；新增配置写入需等待新后端。
- 新前端 + 新后端：完成独立编辑、保存读回与试听参数链路。
- 发布顺序为兼容后端 → 前端。写入新字段后，不能直接回退到不识别该字段的旧后端；前端可回退，兼容后端保留配置。本次未发布。

## 当前阶段

本地实现与验收完成，交付范围为前后端配套 PR；提交、独立审查和 CI 的最终状态以配套 PR 为准。尚未部署。

- 前端全仓 `pnpm typecheck`、`pnpm lint`、`pnpm --filter @tsz/admin build` 通过；lint 保留 2 项既有 Next 跳转警告。补充操作回归后 admin 类型与新增测试文件 eslint 通过。
- `pnpm test --maxWorkers=2`：263 个文件、3860 项通过，2 项既有跳过；其后新增的拼写改字迁移回归随 operations 文件定向执行，54 项通过。设置器真实组件测试覆盖四份配置、草稿试听、完成与取消。
- `pnpm --filter @tsz/api-client test`：24 个文件、546 项通过，含严格字段、不可 null 和全部请求能力头。后端 OpenAPI 与前端 runtime 生成物 SHA256 均为 `128c30462ed379f5d505b93b4ad4e5cc03d71b3cc80ff127fa4734d14802f73b`。
- 后端 `cargo fmt --all --check`、`cargo clippy --locked --all-features --all-targets -- -D warnings` 通过。新增校验、旧客户端省略保留与响应投影的 3 项定向单元测试通过。
- 隔离 PostgreSQL / Redis 下 `cargo test --locked --all-features --test lexicon_handler v3_phoneme_speech_ -- --test-threads=1` 通过：保存与独立 GET、旧页面不读新字段及保存保留、仅清空一份配置、非法正文拒绝且修订不变。
- 后端全量 lib 首轮 361 项通过、1 项新增断言失败：先修正 fixture 默认字段断言，再发现通用富文本允许词内停顿，新增本字段的真实词缝约束并定向验证通过。未将失败首轮记为全量通过。

真实验收采用上述两仓 `HEAD + 工作区差异`：后端构建复制为专用二进制运行于 `127.0.0.1:58176`；admin 生产构建预览于 `127.0.0.1:58177`，实际同源 API 请求证明代理指向该后端。voice editor / preview / Azure inputs 开启，词库、词性与 TTS mock 均关闭，未拦截浏览器请求。

通过专用管理员实际登录；独立空库创建 `far away` 及专用短语词性。页面分别配置英式 IPA 500ms、美式 IPA 1000ms、英式 UPS 2000ms、美式 UPS 3000ms，选中 Sonia / Aria → 完成 → 保存草稿 revision 3 → 独立 GET。四份停顿及音色完整保留，修改后的美式 IPA `fɛɹ ə.ˈweɪ` 生成 `F EH R AX . S1 W EI`，实际发音仍为独立展示文本。页面刷新后音素完整恢复，保存按钮回到无修改状态；重新打开美式 UPS 设置器，词缝回显 3s，Aria 保持勾选，正文仍只读。

真实试听请求含 Sonia、逐词 IPA 和 500ms 停顿；环境未配置 Azure 供应商，返回 503，错误反馈正常。仅验证参数和失败路径，未验证真实音频播放或读音准确性。

验收结束后已关闭并删除专用浏览器数据，停止本任务前后端与独立 PostgreSQL / Redis，删除专用数据目录、账号、词条、词性目录项、会话、缓存、凭据与原始请求副本。独立复查 58174、58175、58176、58177 均无监听，数据目录和浏览器原始日志已不存在。未创建文件上传或对象存储资源；未连接共享业务库。仅保留本记录和脱敏设置器截图。
