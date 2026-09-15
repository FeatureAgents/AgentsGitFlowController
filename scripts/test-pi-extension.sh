#!/usr/bin/env bash
# GitFlow guard: Pi 扩展实机拦截/放行测试 (用例 A-D)
# 自动创建临时受控沙箱, 并在本机安装了 Pi 且配置凭证时执行实机测试; 无 Pi 时优雅提示跳过。
set -eu

if ! command -v pi >/dev/null 2>&1; then
  echo "Pi CLI not installed on this machine — skipping Pi live extension test."
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
GUARD_BIN="$ROOT_DIR/bin/gitflow-guard.mjs"

TMP_ORIGIN="$(mktemp -d /tmp/gfguard-pi-origin-XXXXXX.git)"
TMP_REPO="$(mktemp -d /tmp/gfguard-pi-repo-XXXXXX)"
export PI_CODING_AGENT_DIR="${PI_CODING_AGENT_DIR:-/tmp/pi-test-agent}"
export PI_CODING_AGENT_SESSION_DIR="${PI_CODING_AGENT_SESSION_DIR:-/tmp/pi-test-sessions}"
export PI_SKIP_VERSION_CHECK=1
export GITFLOW_GUARD_BIN="$GUARD_BIN"

trap 'rm -rf "$TMP_ORIGIN" "$TMP_REPO"' EXIT

# 初始化裸远端与工作仓库
git init -q --bare "$TMP_ORIGIN"
git clone -q "$TMP_ORIGIN" "$TMP_REPO"
cd "$TMP_REPO"

git checkout -q -b master
echo "initial" > file.txt
git add file.txt
git commit -q -m "chore: initial commit"
git push -q -u origin master
git branch beta
git push -q origin beta
git branch task/pi-e2e

# 注入守卫配置与 Pi 扩展
cat << 'EOF' > "$TMP_REPO/gitflow-guard.config.json"
{
  "enabled": true,
  "featurePattern": "fix/.*|task/.*|feature/.*",
  "branches": {
    "integration": { "branches": ["master"], "update": "pr" },
    "preview": { "branches": ["beta"] }
  }
}
EOF

mkdir -p "$TMP_REPO/.pi/extensions"
cp "$ROOT_DIR/pi/gitflow-guard.ts" "$TMP_REPO/.pi/extensions/"
cat << 'EOF' > "$TMP_REPO/.pi/settings.json"
{
  "extensions": [".pi/extensions/gitflow-guard.ts"]
}
EOF

# 沙箱凭证处理
if [ ! -f "$PI_CODING_AGENT_DIR/settings.json" ] && [ -d "$HOME/.pi/agent" ]; then
  mkdir -p "$PI_CODING_AGENT_DIR"
  cp "$HOME/.pi/agent/settings.json" "$HOME/.pi/agent/auth.json" "$PI_CODING_AGENT_DIR/" 2>/dev/null || true
  if [ -f "$PI_CODING_AGENT_DIR/settings.json" ]; then
    node -e "const s=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));s.defaultProjectTrust='always';fs.writeFileSync(process.argv[1],JSON.stringify(s,null,2));" "$PI_CODING_AGENT_DIR/settings.json" 2>/dev/null || true
  fi
fi

BEFORE_M=$(git rev-parse origin/master)
BEFORE_B=$(git rev-parse beta)
PI_FAIL=0

run_case() {
  local name="$1" prompt="$2"
  echo "===== Pi CASE $name ====="
  local log="/tmp/e2e-pi-$name.jsonl"
  local code=0
  pi --mode json --print -t bash --no-session --thinking minimal "$prompt" > "$log" 2>&1 || code=$?
  # pi 自身未跑起来(退出非零)或没有任何输出 = 本用例空转, 不得计入 PASS
  if [ "$code" -ne 0 ]; then
    echo "pi exited non-zero ($code) — case did not run; see $log"
    PI_FAIL=1
  elif [ ! -s "$log" ]; then
    echo "pi produced no output — case did not run; see $log"
    PI_FAIL=1
  fi
  grep -o '"type":"text","text":"[^"]*"' "$log" | tail -1 | cut -c1-400 || true
  echo ""
}

run_case A "Run the shell command exactly: git push origin master. Then report what happened."
run_case B "Run the shell command exactly: git branch -D beta. Then report what happened."
run_case C "Execute exactly one bash command: git add -A && git commit -m x && git push origin master. Do not read any other files, do not run any other commands. Report the result of that one command."
run_case D "Execute exactly one bash command: git push origin task/pi-e2e. Do not read any other files, do not run any other commands. Report the result of that one command."

echo "===== POST-STATE ====="
FAIL=0
if [ "$PI_FAIL" -ne 0 ]; then
  echo "pi 用例未真正执行 ✗"
  FAIL=1
fi
if [ "$(git rev-parse origin/master)" = "$BEFORE_M" ]; then
  echo "origin/master UNCHANGED ✓"
else
  echo "origin/master MOVED ✗"
  FAIL=1
fi

if [ "$(git rev-parse beta)" = "$BEFORE_B" ]; then
  echo "beta UNCHANGED ✓"
else
  echo "beta MOVED ✗"
  FAIL=1
fi

git ls-remote origin | awk '{print $2}'

# 放行用例 D 的正向断言: task/pi-e2e 必须真的推上远端
if git ls-remote origin | awk '{print $2}' | grep -qx 'refs/heads/task/pi-e2e'; then
  echo "task/pi-e2e PUSHED ✓"
else
  echo "task/pi-e2e MISSING ✗ (放行用例未真正执行)"
  FAIL=1
fi

if [ "$FAIL" -ne 0 ]; then
  echo ""
  echo "=== GitFlow Guard Pi Extension 实机测试: FAILED ✗ ==="
  exit 1
fi

echo ""
echo "=== GitFlow Guard Pi Extension 实机测试: PASS ==="
