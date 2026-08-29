#!/usr/bin/env bash
# GitFlow guard: 135 项 Git 命令决策穷举矩阵
# 自动在临时目录创建自包含测试仓库, 针对真实 git 分支结构验证命令 allow/deny 判定。
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
GUARD_BIN="${GUARD_BIN:-$ROOT_DIR/bin/gitflow-guard.mjs}"

if [ ! -f "$GUARD_BIN" ]; then
  echo "Error: Guard binary not found at $GUARD_BIN. Run 'npm run build' first." >&2
  exit 1
fi

TMP_REPO="$(mktemp -d /tmp/gfguard-matrix-repo-XXXXXX)"
trap 'rm -rf "$TMP_REPO" /tmp/gf-out.txt /tmp/gf-err.txt' EXIT

# 初始化临时测试仓库
git -C "$TMP_REPO" init -q
git -C "$TMP_REPO" checkout -q -b master
echo "initial" > "$TMP_REPO/a.txt"
git -C "$TMP_REPO" add a.txt
git -C "$TMP_REPO" commit -q -m "chore: initial commit"
git -C "$TMP_REPO" branch beta
git -C "$TMP_REPO" branch fix/verify-01

# 配置角色
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

PASS=0; FAIL=0; FAILED_CASES=""

check() {
  local branch="$1" cmd="$2" want="$3"
  git -C "$TMP_REPO" checkout -q "$branch" || { echo "SKIP [no branch $branch] $cmd"; return; }
  node "$GUARD_BIN" check --command "$cmd" --repo "$TMP_REPO" >/tmp/gf-out.txt 2>/tmp/gf-err.txt
  local code=$? got
  if [ "$code" -eq 2 ]; then got=deny; else got=allow; fi
  if [ "$got" = "$want" ]; then
    PASS=$((PASS+1))
  else
    FAIL=$((FAIL+1))
    FAILED_CASES="$FAILED_CASES\nFAIL [$branch] $cmd => $got (want $want)"
    sed 's/^/    /' /tmp/gf-err.txt | head -2
  fi
}

while IFS=$'\t' read -r b c w; do
  case "$b" in ''|\#*) continue;; esac
  b="${b#"${b%%[![:space:]]*}"}"; b="${b%"${b##*[![:space:]]}"}"
  c="${c#"${c%%[![:space:]]*}"}"; c="${c%"${c##*[![:space:]]}"}"
  w="${w#"${w%%[![:space:]]*}"}"; w="${w%"${w##*[![:space:]]}"}"
  check "$b" "$c" "$w"
done <<'EOF'
# ============ A. push 族 ============
master	git push origin master	deny
master	git push --force origin master	deny
master	git push -f origin master	deny
master	git push origin master:master	deny
master	git push origin master:beta	deny
master	git push origin master:task/test-01	allow
master	git push origin HEAD	deny
master	git push origin HEAD:master	deny
master	git push origin --delete master	deny
master	git push origin :beta	deny
master	git push --mirror origin	deny
master	git push --all origin	deny
master	git push origin refs/heads/*:refs/heads/*	deny
master	git push --tags origin	allow
master	git push origin +master:task/test-01	allow
fix/verify-01	git push origin fix/verify-01	allow
fix/verify-01	git push --set-upstream origin fix/verify-01	allow
fix/verify-01	git push origin master	deny
fix/verify-01	git push origin fix/verify-01:master	deny
fix/verify-01	git push origin fix/verify-01 --delete	allow
fix/verify-01	git push --force origin fix/verify-01	allow
beta	git push origin beta	deny
beta	git push origin master	deny
beta	git push origin task/test-01	allow
# send-pack / 全局选项 / 包装器
master	git send-pack origin refs/heads/master:refs/heads/master	deny
master	git -C /other/repo push origin master	deny
master	git --git-dir=/x --work-tree=/y push origin master	deny
master	sh -c "git push origin master"	deny
master	bash -lc 'git push origin master'	deny
master	env GIT_DIR=/x git push origin master	deny
master	FOO=1 git push origin master	deny
master	xargs git push origin master	deny
master	command git push origin master	deny
master	sudo git push origin master	deny
master	sudo -u root -E git push origin master	deny
master	sudo -- git push origin master	deny
master	sudo -uroot git push origin master	deny
master	sudo sh -c "git push origin master"	deny
fix/verify-01	sudo git push origin fix/verify-01	allow
# ============ B. merge / pull 族 ============
master	git merge fix/verify-01	deny
master	git merge --no-ff fix/verify-01	deny
master	git merge --squash fix/verify-01	deny
master	git merge beta	allow
master	git merge origin/master	deny
master	git merge	allow
master	git merge --abort	allow
master	git pull origin master	allow
master	git pull --rebase origin master	allow
master	git pull origin fix/verify-01	deny
fix/verify-01	git merge master	allow
fix/verify-01	git pull origin master	allow
beta	git merge fix/verify-01	deny
beta	git merge master	allow
# ============ C. checkout / switch ============
master	git checkout -b task/test-01	allow
master	git switch -c task/test-02	allow
master	git checkout -B master	deny
master	git switch -C beta	deny
master	git checkout -B task/test-01	allow
master	git checkout -bf task/test-03	allow
fix/verify-01	git checkout -B task/test-04	allow
fix/verify-01	git checkout -B master	deny
master	git checkout -Bf master	deny
master	git checkout -B master beta	deny
master	git checkout beta	allow
master	git checkout -- a.txt	allow
master	git checkout master	allow
# ============ D. ref-move(本地改写 tip) ============
master	git reset --hard HEAD~1	deny
master	git reset --soft HEAD~1	deny
master	git rebase beta	deny
master	git rebase -i HEAD~2	deny
master	git rebase --abort	allow
master	git commit --amend --no-edit	deny
master	git commit -am x	allow
master	git filter-branch -- --all	deny
fix/verify-01	git reset --hard HEAD~1	allow
fix/verify-01	git rebase master	allow
fix/verify-01	git commit --amend --no-edit	allow
# ============ E. ref-update / branch 删除改名 ============
master	git branch -m master master-old	deny
master	git branch -M master master-old	deny
master	git branch -D master	deny
master	git branch -d --force beta	deny
master	git branch -f beta HEAD	deny
master	git branch -d fix/verify-01	allow
fix/verify-01	git branch -m fix/verify-01 task/renamed	allow
master	git update-ref refs/heads/master HEAD	deny
master	git update-ref -d refs/heads/beta	deny
master	git update-ref refs/heads/task/plumbing HEAD	allow
master	git symbolic-ref refs/heads/beta refs/heads/master	deny
master	git symbolic-ref --delete refs/heads/beta	deny
master	git symbolic-ref -d refs/heads/task/plumbing	allow
master	git symbolic-ref refs/heads/task/plumbing refs/heads/master	allow
master	git symbolic-ref HEAD	allow
master	git symbolic-ref --short HEAD	allow
# ============ F. PR / MR ============
fix/verify-01	gh pr create --base master	allow
master	gh pr create --base master	deny
fix/verify-01	gh pr create --base beta	allow
master	gh pr create --base beta	deny
fix/verify-01	gh pr create --base main	allow
fix/verify-01	gh pr create	deny
fix/verify-01	gh pr merge 1	deny
fix/verify-01	glab mr create --target-branch master	allow
master	glab mr create --target-branch master	deny
fix/verify-01	glab mr merge 1	deny
# ============ G. 链式 / 嵌套 / 分隔 ============
master	git add -A && git commit -m x && git push origin master	deny
fix/verify-01	git commit -am x && git push origin fix/verify-01	allow
master	git checkout -B master && git push origin master	deny
fix/verify-01	git checkout -B task/test-05 && git push origin task/test-05	allow
master	git push origin master || true	deny
master	git push origin master; git status	deny
master	echo $(git push origin master)	deny
master	echo `git push origin master`	deny
master	(git push origin master)	deny
master	git push origin "master"	deny
# ============ H. 其他真实场景 ============
master	git status	allow
master	git fetch origin master	allow
master	git fetch --all	allow
master	git stash push -m x	allow
master	git stash pop	allow
master	echo hi	allow
master	npm test	allow
master	git cherry-pick abc123	deny
master	git cherry-pick abc123 def456	deny
master	git cherry-pick -n abc123	allow
master	git cherry-pick --abort	allow
master	git cherry-pick --continue	allow
master	git revert HEAD	deny
master	git revert -m 1 abc123	deny
master	git revert --no-commit HEAD	allow
master	git revert --continue	allow
fix/verify-01	git cherry-pick abc123	allow
fix/verify-01	git revert HEAD	allow
master	git tag -f v1 master	allow
master	git worktree add ../wt master	allow
master	git svn dcommit	allow
master	gitflow-guard status	allow
EOF

printf '%b' "$FAILED_CASES"
echo ""
echo "=== GitFlow Guard 135 决策矩阵: $PASS PASS / $FAIL FAIL ==="
[ "$FAIL" -eq 0 ]
