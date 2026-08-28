// 本仓库 dogfood 接入(AGENTS.md §8.3): Pi 会话内的 git 命令经守卫门禁。
// 相对路径直连构建产物 lib/(本仓库即包本身, 绕开 npm 自引用, 需先 npm run build);
// 外部项目请复制随包发布的 pi/gitflow-guard.ts 并配 .pi/settings.json。
import { createPiExtension } from '../../lib/index.mjs'

export default createPiExtension()
