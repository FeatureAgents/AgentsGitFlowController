# e2e-run · 执行实机测试并取证(基于 gfguard-e2e 测试场)

本技能规范「如何执行实机测试、如何取证」:用例来自 `docs/e2e/<client>.md`,证据写入 `docs/e2e/TestResult/<client>.md`(证据规范见其 README),测试场为 `/Users/kean/Workspace/gfguard-e2e`。

## 前置检查(必做)

1. **守卫版本核对**:被测守卫 = 当前 develop 构建产物(`npm run build` 已跑,`lib/` 最新);测试场挂载版本须与被测一致(gfguard-e2e `node_modules/agents-gitflow-guard/package.json`;不一致时 `npm i -D agents-gitflow-guard@<被测版本>` 或现场替换 node_modules,并记入 TestResult)。
2. **测试场就绪**:gfguard-e2e 裸远端 `/tmp/gfguard-e2e-origin.git` 存在(reboot 后重建:`git init -q --bare` + `git remote add origin` + 推送 master/beta);缺口:Pi 用例 D 需本地 `task/pi-e2e` 分支(先 `git branch task/pi-e2e`,脚本未自建)。
3. **受控仓库**:Pi 用 gfguard-e2e 本体;其他客户端建议独立受控仓库(`/tmp/e2e-<client>-repo`:master=integration/beta=preview/(fix|task)/*=feature + 本地裸远端 + config),**禁止对真实远端执行会成功的用例**。
4. **客户端凭证**:各客户端冒烟一条(如 `claude -p "Reply with exactly: OK"`、`pi --mode json ... "PI-OK"`、`opencode run "OK"`);沙箱受限时按各平台 XDG/临时目录重定向复制凭证(gfguard-pi-cases.sh 已有沙箱处理)。

## 执行流程

1. **wire 落位**(stdin-hook 客户端):`gitflow-guard wire --client <x> --project --yes`(受控仓库内),确认产物;DSH/Pi 走进程内(DSH 需重装 profile + 重启)。
2. **按 docs/e2e/<client>.md 执行用例**,顺序:拦截组(A)→ 放行组(B)→ 接线组(C)→ 平台特有(D)。
3. **每个用例取证**:
   - 命令执行前记录远端 ref(`git ls-remote origin <ref>`);
   - 执行后对比(拦截:未动;放行:出现/前移);
   - 摘录客户端展示的拒绝原因与 hook stderr(会话输出/日志);
   - 审计证据:`gitflow-guard audit`(受控仓库内)或 `~/.local/state/gitflow-guard/repos/*/audit.jsonl`;
   - 原始日志保存到可引用路径,关键内容**摘录进 TestResult**(临时文件重启会消失)。

## 证据写入(TestResult 规范,必含)

- 测试信息表:日期/守卫版本/客户端版本/测试场/LLM provider·model/挂载方式;
- 结果汇总表:用例 ID(与 docs/e2e 对应)/PASS·FAIL·NOT RUN/一句话证据;
- 证据细节:输出摘录 + 远端 ref 前后;
- 发现与遗留:缺陷/待办/复现方式。

## 发现缺陷时的处置

1. **先记录,再判断**:原样记录失败现象与证据(参考 OpenCode 1.18 hook 失效案例:协议层绿 ≠ 实机有效);
2. 区分「测试场前置问题」(如分支缺失、版本挂载)与「产品缺陷」;
3. 产品缺陷 → TestResult 写清影响面与复现,另开 issue/PR 修复;修复后**重跑该平台全量用例**;
4. 各平台判定口径与互证:拦截 = 命令未执行 + 拒绝原因展示;放行 = 真实副作用。

## 收尾

- 全部受影响平台执行完毕后,按项目纪律 QA 三连并提交(TestResult 与用例文档随功能 PR 一并提交);未测平台在 TestResult 标注 NOT RUN + 用户所需准备(如安装/凭证)。