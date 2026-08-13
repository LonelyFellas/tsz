# 语音富文本编辑器测试用例矩阵

## 自动化用例

| #   | 层         | 场景                   | 输入 / 前置                                                        | 预期                                                                     | 优先级 |
| --- | ---------- | ---------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------ |
| C01 | 单元       | Unicode 码点索引       | ASCII、emoji、组合字符、IPA、换行                                  | UTF-16 / TipTap position 与 code-point offset 可往返，越界显式失败       | P0     |
| C02 | 单元       | V2 标注归一化          | 乱序、相邻/重叠的同属性 emphasis/highlight/liaison、重复 pause     | 合并、替换并稳定排序；输入对象不被修改                                   | P0     |
| C03 | 单元       | V2 校验边界            | 空区间、越界、跨段、重叠 phoneme、pause 0/5001/小数、正文/标注超限 | 返回精确错误，不能静默截断或输出非法值                                   | P0     |
| C04 | 单元       | V1 兼容迁移            | bold、blue、首/中/尾 liaison point 与 emoji                        | 映射为 V2 工作态；原 V1 引用和值不变                                     | P0     |
| C05 | 单元       | canonical hash         | 同义但顺序不同的标注、文本/voice 参数变化                          | 规范化后 hash 稳定；任一有效语义变化产生不同 hash                        | P0     |
| C06 | 单元       | SSML 基本语义          | emphasis、phoneme、pause、多段、rate、pitch、style                 | 生成合法确定的嵌套；段落插 500ms；纯视觉标注不进入 SSML                  | P0     |
| C07 | 单元       | SSML 安全              | 文本/IPA/voice/style 含 `&<>"`                                     | 全部 XML escape，不形成注入或交叉 XML                                    | P0     |
| M01 | 单元       | TipTap ↔ RichText 往返 | 含五类标注的 V2、多段文本                                          | 编辑器 JSON 往返后正文与 canonical 标注等价                              | P0     |
| M02 | 单元       | 编辑后的区间位置       | 在标注前/内/后插入和删除，删除 pause 邻接文本                      | 导出偏移与 TipTap transaction 后的真实位置一致                           | P0     |
| R01 | 组件       | 轻量只读渲染           | V1、V2、空文本、五类标注                                           | 展示正确语义 class/IPA/停顿；不创建 contenteditable                      | P0     |
| R02 | 组件       | 字段入口与只读态       | editable / readOnly、context label                                 | 编辑态触发 `onEdit`；只读态无编辑入口                                    | P0     |
| E01 | 组件       | 编辑器打开/取消/应用   | V1/V2 value、修改正文                                              | 取消不回调；应用只回调合法 V2；dirty 状态准确                            | P0     |
| E02 | 组件       | 选择型工具状态         | 无选区、全选文字、撤销/重做                                        | 无选区禁用；选择后可执行；undo/redo 状态随 transaction 更新              | P0     |
| E03 | 组件       | 重音/连读/高亮/清除    | 同一选区重复操作、不同颜色、重叠选区                               | toggle 语义正确；清除不删正文和选区外标注                                | P0     |
| E04 | 组件       | IPA 标注               | 已有 IPA、pronunciationHints 命中/未命中、空值/Escape              | 回填优先级正确；应用/清除/取消行为正确                                   | P0     |
| E05 | 组件       | pause 原子节点         | 光标插入、预设/自定义修改、非法值、删除                            | 正确显示和更新；非法值阻止应用并给出反馈                                 | P0     |
| E06 | 组件       | 无 TTS adapter 降级    | 不传 `previewAdapter`                                              | 编辑/SSML/PDF 仍可用；生成按钮禁用且说明原因                             | P0     |
| E07 | 组件       | voice capability 联动  | 支持/不支持 style、rate、pitch 的 voice                            | 只展示/启用合法组合，切 voice 后非法旧选项被清理                         | P0     |
| E08 | 组件       | TTS 成功与缓存         | adapter 成功返回新合成/缓存命中                                    | 防重复、自动播放、状态正确、可重播                                       | P0     |
| E09 | 组件       | TTS 错误、过期与清理   | reject、内容变化、关闭、迟到响应                                   | 保留编辑内容；旧音频 stale；请求 abort；Audio/URL/监听器释放             | P0     |
| E10 | 组件       | 打印状态清理           | 触发打印、`afterprint`、兜底 timer                                 | 仅当前 print root 可见；body class 两条路径均幂等清除                    | P0     |
| B01 | 架构       | package 依赖边界       | 扫描 `packages/voice-editor/src` imports                           | 不依赖 apps、api-client、router、Query、admin DTO；无业务深路径          | P0     |
| B02 | 架构       | package 公开入口       | root/core/reader/editor/styles exports                             | 各入口可解析；reader 不静态引入 TipTap editor 模块                       | P0     |
| A01 | 单元       | admin TTS adapter 映射 | snake_case voice/preview wire 与 camelCase 包模型                  | 双向字段、AbortSignal、错误状态映射正确                                  | P0     |
| A02 | 集成       | meanings 字段接入      | 语法结构、英文释义、英文例句、中文字段                             | 三类英语字段打开同一实例并回写正确 node/dialect；中文保持 TextArea       | P0     |
| A03 | 集成       | 方言/排序与 dirty      | UK/US 切换、节点排序、应用/取消                                    | 标注不串位；稳定 node id 回写；应用后 dirty，取消不 dirty                | P0     |
| A04 | 集成       | 只读预览               | published V2，RichText V1/V2                                       | 使用包 renderer 展示；不能编辑或生成                                     | P0     |
| P01 | api-client | TTS 端点               | voices query、preview body                                         | 发出正确 method/path/snake_case body                                     | P0     |
| P02 | 契约       | OpenAPI speech 对账    | tsz-rust spec 的 voices / previews 路径与 wire                     | `/speech/*`、`voice_alias`、capabilities 与 `cache_status` 全部命中 spec | P0     |
| X01 | e2e        | 关键创编链路           | admin mock 向导英文例句                                            | 打开编辑器→加标注→mock 试听→应用→保存→刷新恢复                           | P1     |

## 手测清单

- [ ] macOS Chrome/Safari：中文输入法、英文输入、emoji、组合字符和 IPA 连续编辑，光标与标注不漂移。
- [ ] 大型词条（多词性、多词义、数十条释义/例句）：页面只存在一个活动 TipTap 实例，打开/关闭无明显卡顿。
- [ ] 真实 TTS：发音人目录、能力禁用、缓存命中、限流、配额不足和供应商故障提示符合后端问题码。
- [ ] 音频播放：自动播放被浏览器策略阻止时有可点击恢复方式；切内容、切 voice、关闭抽屉时旧音频停止。
- [ ] 浏览器打印预览：只出现当前正文，保留重音、IPA、连读和高亮，隐藏 pause 与 admin 其他页面内容。
- [ ] 键盘与无障碍：Tab 顺序、按钮名称、选中态、Escape、撤销/重做快捷键和 Popover 焦点返回正确。
- [ ] 窄屏 admin：Drawer 全宽，工具栏可换行，正文、语音设置和应用按钮均可操作。

## 落地规则

- 每个 P0 行在实现阶段必须有对应自动化测试，不以覆盖率数字替代行为断言。
- `packages/voice-editor` 纳入根 Vitest project 与 `packages/**` 100% 覆盖率门槛。
- TTS fixture 使用 snake_case wire；包内 adapter/props 使用 camelCase。
- 后端未就绪期间，P01/P02 与 typed mock 共同防止“自证自话”的伪接口。
