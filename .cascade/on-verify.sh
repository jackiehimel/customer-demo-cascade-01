#!/usr/bin/env bash
set -e
npm run lint && npm run typecheck
[ "$1" = "full" ] && npm test --if-present
true
