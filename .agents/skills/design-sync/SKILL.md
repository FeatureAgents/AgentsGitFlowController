# design-sync · 功能扩展时同步更新设计文档

在**任何功能扩展/行为变化**落地代码前加载本技能:保证「实现 = 设计文档 = 参考文档」三者同步,禁止先改代码后补文档。

## 触发场景

- 新增/修改命令族分类(classify)、门禁语义(gate)、配置项(config)、文案(i18n)
- 新增/修改客户端接入或 hook 协议(platform/wire/cli/index/pi)
- 任何影响"拦截行为"的改动(判定、编码、降级、接线)

## 步骤

1. **改动定位**:先明确扩展落在哪一层的哪个文件(对照下方映射表),再动手。
2. **更新 docs/design.md**(权威规格):门禁矩阵、分类器硬化面、平台协议表、配置 schema、测试策略等对应章节。
3. **更新 docs/design/<client>.md**(客户端拦截实现细节,按客户端分文件):只更新受影响客户端的文件;若扩展涉及通用管线(evaluateCommand 内核)则所有 6 个文件检查一遍相关小节。
4. **更新 .agents/hooks/references/<client>.md**(协议速查):与 wire 产物、platform.ts 编码保持一致(AGENTS.md §8 清单第 4 条)。
5. **一致性核对(逐项问自己)**:
   - `src/platform.ts` 的 encodeDeny/extractHookPayload 与 references 文档、docs/design 编码表逐字一致;
   - `src/wire.ts` 的 COMMANDS/模板与 references 文档示例一致;
   - 新增行为在 docs/design 门禁矩阵有行(含豁免理由);
   - README 双语若涉及行为面变化(如新增拦截面/豁免)同步。
6. **配套变更**(按 AGENTS.md 纪律):CHANGELOG 一条 feat 随同一 PR;单测与复测矩阵由 e2e-cases skill 覆盖。

## 文档 → 实现 映射表

| 文档 | 对应实现 |
|---|---|
| `docs/design.md` 门禁矩阵/分类硬化面 | `src/classify.ts` / `src/gate.ts` / `src/index.ts` |
| `docs/design.md` 配置 | `src/config.ts` / `src/types.ts` |
| `docs/design/<client>.md` | 对应客户端接入总览(见各文件"代码位置索引"节) |
| `.agents/hooks/references/<client>.md` | `src/platform.ts` / `src/wire.ts` / `src/pi.ts` / `src/index.ts` / `patch.yml` |
| README 双语行为面 | 用户可见行为(默认配置/拦截面/豁免) |

## 纪律

- **先文档后代码**(或同一提交内同步),审查时三方对照;
- docs/design/<client>.md 为本地工作文档(不提交),但必须保持最新——它是下一个 session 的依据;
- 拿不准的协议点(如新客户端 wire 格式):标注"待真机核验",不得写成已定稿;