<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Codebase navigation: use graphify

This project keeps a code knowledge graph at `graphify-out/graph.json`. For
"how does X work / who calls Y / what's related to Z" questions, query the graph
instead of grep-reading whole files (skill: `.claude/skills/graphify/SKILL.md`):

- `graphify query "<question>" --depth 1` — start here; widen `--depth`/`--budget` only if truncated.
- `graphify path "A" "B"` — call chain between two symbols.
- `graphify explain "<symbol>"` — one node plus its neighbors.

After editing code, run `graphify update .` (AST-only, no API cost) to keep the
graph current. `graphify-out/` is gitignored build output. The CLI lives at
`~/.local/bin/graphify` (installed via `uv tool install graphifyy`).
