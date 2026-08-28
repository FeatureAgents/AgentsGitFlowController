// Pi 扩展入口(随包发布, 可复制): 拦截 bash/powershell 的 git 系命令, 经守卫 CLI 门禁后
// 以官方 tool_call 协议 { block: true, reason } 拒绝。协议见仓库 .agents/hooks/references/pi.md。
//
// 用法(推荐): 复制本文件到 <project>/.pi/extensions/gitflow-guard.ts, 项目 devDependencies
// 安装 agents-gitflow-guard(jiti 从扩展所在项目解析裸导入); 仓库再配 .pi/settings.json:
//   { "extensions": ["extensions/gitflow-guard.ts"] }
//
// 也可以不复制: 手写一行 wrapper 后放任意位置并绝对路径登记进 extensions。
import { createPiExtension } from 'agents-gitflow-guard'

export default createPiExtension()
