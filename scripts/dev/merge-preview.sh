#!/usr/bin/env bash
# Merge-preview a track branch onto main in a throwaway worktree and run the fast checks.
# Usage: scripts/dev/merge-preview.sh <branch> [outdir]
set -u
branch="$1"; out="${2:-/tmp/merge-preview}"
root="$(git rev-parse --show-toplevel)"
dir="$out/$(echo "$branch" | tr '/' '_')"
rm -rf "$dir"
git -C "$root" fetch -q origin "$branch" main || { echo "fetch failed"; exit 2; }
git -C "$root" worktree add -q -f --detach "$dir" origin/main || { echo "worktree failed"; exit 2; }
ln -sfn "$root/node_modules" "$dir/node_modules"
cd "$dir"
if ! git merge -q --no-edit "origin/$branch" 2> "$dir.merge.log"; then
  echo "CONFLICTS:"; git diff --name-only --diff-filter=U; git merge --abort; cd "$root"; git worktree remove -f "$dir"; exit 3
fi
echo "merged $(git rev-parse --short origin/$branch) onto $(git rev-parse --short origin/main)"
git diff --stat origin/main | tail -1
ok=1
npx tsc --noEmit -p tsconfig.json > "$dir.tsc.log" 2>&1 && echo "tsc: ok" || { echo "tsc: FAIL (see $dir.tsc.log)"; ok=0; }
npx eslint src tests --max-warnings=0 > "$dir.lint.log" 2>&1 && echo "lint: ok" || { echo "lint: FAIL (see $dir.lint.log)"; ok=0; }
npx vitest run > "$dir.vitest.log" 2>&1 && echo "vitest: $(grep -E 'Tests ' "$dir.vitest.log" | tail -1)" || { echo "vitest: FAIL (see $dir.vitest.log)"; ok=0; }
cd "$root"; git worktree remove -f "$dir"
[ $ok = 1 ] && echo "PREVIEW OK" || echo "PREVIEW FAILED"
