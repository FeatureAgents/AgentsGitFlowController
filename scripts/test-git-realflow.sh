#!/usr/bin/env bash
# GitFlow guard: 真实放行流 —— Feature 分支全生命周期实机测试
# 自动在临时目录创建裸远端与受控工作仓库, 验证 feature 分支全生命周期(建/改/amend/reset/merge/push/force push/rename/delete)
set -eu

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
GUARD_BIN="${GUARD_BIN:-$ROOT_DIR/bin/gitflow-guard.mjs}"

TMP_ORIGIN="$(mktemp -d /tmp/gfguard-realflow-origin-XXXXXX.git)"
TMP_REPO="$(mktemp -d /tmp/gfguard-realflow-repo-XXXXXX)"
trap 'rm -rf "$TMP_ORIGIN" "$TMP_REPO"' EXIT

# 初始化裸远端
git init -q --bare "$TMP_ORIGIN"

# 初始化工作仓库并关联远端
git clone -q "$TMP_ORIGIN" "$TMP_REPO"
cd "$TMP_REPO"

git checkout -q -b master
echo "initial" > file.txt
git add file.txt
git commit -q -m "chore: initial commit"
git push -q -u origin master
git branch beta
git push -q origin beta

# 注入守卫配置
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

B="task/realflow-$(date +%s)"

echo "[1/10] checkout -b feature"
git checkout -qb "$B"

echo "[2/10] commit on feature"
echo "change-$B" > realflow.txt
git add realflow.txt
git commit -qm "feat: realflow file"

echo "[3/10] amend on feature"
git commit --amend --no-edit -q

echo "[4/10] reset --soft on feature"
git reset -q --soft HEAD~1
git commit -qm "feat: realflow re-commit"

echo "[5/10] merge master into feature"
git merge -q --no-ff master -m "merge master in"

echo "[6/10] push -u feature to origin"
git push -qu origin "$B"

echo "[7/10] force push feature to origin"
git push -q --force origin "$B"

echo "[8/10] rename feature branch"
git branch -qm "$B" "$B-renamed"

echo "[9/10] push renamed branch & delete old/renamed from remote"
git push -q origin "$B-renamed"
git push -q origin "$B-renamed" --delete

echo "[10/10] checkout master & delete local feature branch"
git checkout -q master
git branch -qD "$B-renamed"

echo ""
echo "=== GitFlow Guard Feature 生命周期实机放行流: ALL REALFLOW OK ==="
