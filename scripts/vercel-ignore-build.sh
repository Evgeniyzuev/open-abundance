#!/bin/sh
# Vercel "Ignored Build Step" (vercel.json ignoreCommand): exit 0 skips the build, exit 1 builds.
# A push that changes only docs, Markdown, reports or CI files does not change the site, so it gets no new deployment
# (each deployment takes Deployment Storage). Anything unclear builds.
prev="$VERCEL_GIT_PREVIOUS_SHA"
[ -n "$prev" ] || exit 1
git cat-file -e "$prev^{commit}" 2>/dev/null || git fetch --quiet --depth=50 origin "$prev" 2>/dev/null || exit 1
changed=$(git diff --name-only "$prev" HEAD 2>/dev/null) || exit 1
[ -n "$changed" ] || exit 1
if echo "$changed" | grep -Ev '^(docs/|reports/|\.github/)|\.md$' | grep -q .; then
  exit 1
fi
echo "Only docs changed since $prev: skipping the build."
exit 0
