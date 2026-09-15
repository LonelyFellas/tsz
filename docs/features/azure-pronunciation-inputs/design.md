# 任务 54：Azure IPA / UPS 独立合成输入设计与实现

状态：前后端已实现；自动转换规则仅部分覆盖，完整听感仍待验收。日期：2026-09-15。
需求见 [requirements.md](requirements.md)，验证见 [verification.md](verification.md)，业界取舍见 [industry-practice.md](industry-practice.md)。

## 1. 基线与依赖

| 仓库 | 本任务 checkout                                                   | 基线                                                 |
| ---- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| 前端 | `/Users/darwish/.codex/worktrees/b5d4/tsz`                        | 本地 main `0d35927401b79aab379ec61f9479642c8e810f50` |
| 后端 | `/Users/darwish/Dev/tsz-core/tsz-rust-azure-pronunciation-inputs` | 本地 main `4ad21fadc3f66dabdfa0e23d0009df7fedbb730e` |

两仓分支均为 `codex/azure-pronunciation-inputs`；实现与验收基于上述基线加本任务改动。新前端任务初始 HEAD 为 `de6f7eb`，已按用户明确指定切回本地 main；后端从本地 main 创建新 worktree，主 checkout 的其他任务改动保持原样。

关键路径：数据字段与严格契约 → phoneme 请求与 SSML → 页面/复制/发布保真 → 定向与真实验证。完整转换规则和人工听感是独立验收依赖。

| 能力                                       | 处理                                            |
| ------------------------------------------ | ----------------------------------------------- |
| 发音列表、实际发音连读、方言映射           | 复用主线能力                                    |
| 音色、语速、取消请求、逐音色试听、上传资产 | 复用现有 voice-editor 与 preview adapter        |
| 两套候选和来源持久化                       | 新增可选 synthesis，沿用现有 JSON 存储          |
| UPS                                        | 扩展已有 phoneme 枚举及 SSML 分支，无新业务端点 |
| 转换                                       | shared 纯函数、已核实规则，未知/歧义定位失败    |
| 生产切换                                   | 新入口开关，默认兼容读取、保留字段              |

## 2. 数据与校验

每条 `WordPronunciationV3` 可包含：

```ts
synthesis?: {
  alphabet: "ipa" | "ups";
  ipa: string;
  ups: string;
};
```

- 旧记录缺省不输出，不批量回填，不改写旧快照。
- 新输入默认选择 IPA；两候选独立保存。保存/新发布前两侧均为空白时归一为缺省。
- IPA 最多 200 Unicode 码点；UPS 最多 1600。UPS 是 ASCII token 串，相邻 token 的分隔会扩大长度；两端使用一致的独立上限。此上限是本应用资源限制，不是微软承诺的音素数量。
- 草稿可保留另一侧有内容、选中侧为空的状态；完全未配置的记录不增加完成/发布门槛。
- 候选均禁止控制字符及超长内容；完成/发布校验选中侧非空，UPS 必须为 ASCII。未选中候选不要求音素合法。字典符号解析和供应商支持不能仅由长度/ASCII 校验保证，具体音素的支持仍由真实试听确认。
- 原有 RichText 的 NUL 规则保持不变，没有借此次功能收紧历史富文本控制字符规则。
- `voice_profile` 与 `audio_assets` 仍归发音记录，切换源不清理录音。`audio_assets` 是上传资产，不是 Azure 试听缓存。

实际存储：`lexicon.entry_editor_projection.forms` 保存完整 forms JSON；发布保存完整 V3 快照。无新增表、列或迁移。
显式保真点已补齐：前端 `model.ts::pronunciationWire`、`operations.ts::variantMappingFrom`，后端 `cloned_v3_pronunciations`。英美合并比较包含 synthesis，差异要求显式处理，不能静默选边。
发音节点 hash 在 synthesis 存在时纳入该对象；缺省仍保持原 hash 输入。

## 3. 合成链路

仍使用 `POST /api/v1/admin/speech/previews`。`pronunciationSynthesisContent` 组装：

```json
{
  "version": 2,
  "text": "cat",
  "annotations": [
    {
      "type": "phoneme",
      "start": 0,
      "end": 3,
      "alphabet": "ups",
      "phoneme": "K AE T"
    }
  ]
}
```

区间按 Unicode 码点计数。后端按 alphabet 输出 `<phoneme alphabet="ups" ph="K AE T">cat</phoneme>`，沿用 XML 转义、Azure provider、对象存储、缓存和限流。

- 选中内容为空或基础格式不合法时不发请求，不退回字典音标/另一侧/拼写默认读法。
- `canonicalVoiceHash` 与后端 fingerprint 已包含完整 content、alphabet、音素、音色和语速，无需新增缓存模型。
- 最终读音与发音面板用同一个内容构造器；未选中的候选或字典展示变化不改变当前请求。
- `useVoiceAudition` 保留取消与旧回包丢弃；`PronunciationPreviewControls` 保留最终播放的取消和过期处理。

## 4. 页面与编辑器复用

`V3SynthesisInputs` 负责两框、单选、主动转换、错误定位、替换预览与撤销。
转换始终读取字典音标，UPS 转换不读取人工 IPA；不会自动切来源或发声。已有不同目标内容必须显式应用，目标已在期间改变则要求重新转换。

`VoiceEditor` 新增 `mode="synthesis"`：只展示现有音色/语速/试听和上传面板，直接使用传入 phoneme content 试听，不经过 `workingValue` 正文重建，也不向宿主回写标注。复用现成上传生命周期，未复制整套上传逻辑或建立第二个 Azure client。

字典输入继续通过 `V3VoiceTextField` 的普通正文编辑路径维护历史 rich text 一致性，关闭旧语音编辑入口。实际发音连读保持原样。
发布预览与历史显示所选格式/内容。合成字段校验带 `data-v3-node-id` 与 `data-v3-field="synthesis.ipa/ups"`，可定位到输入框。

## 5. 自动转换范围

当前转换器以确认的 IPA 音素作为内部记法，按目标选择 IPA 或 UPS 表达。最长组合先匹配，未知符号返回原文码点位置，不输出部分结果。

已实现：

- 成对 `/…/`、`[…]` 及边缘空白处理；不删除内部未知字符。
- 微软表中明确对应的基本辅音/元音，例 `/kæt/` → `kæt` / `K AE T`。
- 塞擦音组合 `tʃ`、`dʒ`、带连结符及旧连字形式，UPS 输出 `CH`、`JH`，避免逐字符输出错误的 `T SH`。
- IPA 保留官方列出的长音/双元音组合；重音/音节标记做位置检查，非首重音无明确边界时失败。
- 输出长度、控制字符校验，原始位置诊断；转换不覆盖另一候选。

未定稿：字典 r 的宽式约定、单独 e/ɛ 约定、可选音/可选 r、组合附加符、成音节辅音，以及 UPS 重音、长音、双元音和跨音节映射。未知符号明确失败，可手工录入。不能将这个部分转换器宣传成通用字典转换工具。

微软 structured-text UPS 表用于识别训练，当前仅作为明确符号对应的参考；合成支持还须按 en-GB/en-US 目标音色审听。用户要求调查业界后，建议继续以 IPA 为默认，UPS 为独立候选，不增加拼写 G2P/LLM 猜测路径。

## 6. 严格契约与发布顺序

实际验证表明旧前端严格 schema 拒绝带 synthesis 的记录，新 reader 能同时读取旧记录和新记录。旧后端 DTO `deny_unknown_fields` 也不接受新字段。

`VITE_AZURE_PRONUNCIATION_INPUTS`：dev 默认 true，生产默认 false；示例环境显式 false。部署入口使用严格布尔值 `DEPLOY_AZURE_PRONUNCIATION_INPUTS`（默认 false）显式传入清洁构建环境；兼容阶段用 false，后端验收后用 true 重发 admin。

1. 先发布入口关闭的兼容 reader：旧数据不自动生成 synthesis；已有 synthesis 只读展示并在其他编辑保存中原样保留，仍提供共享音色设置与真人录音上传/播放入口。旧后端期间不能从新入口写入新字段。
2. 再切换支持字段/UPS 的后端；缺省旧记录仍不输出字段。
3. 确认兼容前端生效，结束或要求刷新旧编辑会话后，显式开启新入口。静态资源更新不保证长开页面已升级；实际发布需受控编辑切换。
4. 已有新数据后只允许回退到兼容 reader/writer；关闭开关不删除字段，也不使旧后端重新可用。不能回滚到完全不认识 synthesis/ups 的版本。

本任务已获得两仓本地提交授权；未执行发布、合并、PR 或推送。
OpenAPI 由本任务后端工作区生成，前端使用显式 `OPENAPI_SOURCE` 同步，证据与哈希见验证记录。
