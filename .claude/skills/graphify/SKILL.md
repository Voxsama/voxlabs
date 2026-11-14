---
name: graphify
description: Query and maintain the project's code knowledge graph. Use this when answering codebase questions (how does X work, what calls Y, find relationships), or after modifying code (rebuild the graph). Runs the graphify CLI against graphify-out/graph.json.
---

# graphify — code knowledge graph

This project maintains a knowledge graph at `graphify-out/graph.json`. Use the
`graphify` CLI (installed at `~/.local/bin/graphify`) instead of raw grep for
codebase navigation questions, and rebuild the graph after code changes.

## When to use

- Answering "how does X work / who calls Y / what's related to Z"
- After modifying code: run `graphify update .` to keep the graph current (AST-only, no API cost)
- When `graphify-out/graph.json` does not exist yet: build it first with `graphify update .`

## Commands

| Command | Purpose |
|---|---|
| `graphify query "<question>"` | BFS traversal answering a codebase question; scoped subgraph, usually much smaller than grep output |
| `graphify path "A" "B"` | Shortest path between two nodes (relationships) |
| `graphify explain "<concept>"` | Plain-language explanation of a node + its most connected neighbors |
| `graphify affected "X"` | Reverse traversal: nodes impacted by X |
| `graphify god-nodes` | Most connected nodes (architectural hubs) |
| `graphify update .` | Re-extract code files and update the graph (no LLM needed). Use `--force` after refactors that delete code |
| `graphify clone <github-url>` | Clone a GitHub repo locally for analysis |

Useful flags: `query --budget N` / `--depth N` (depth 1–6, default 2) when the
answer is truncated; `--directed` / `--undirected` for path direction.

## Rules

- **Token budget: keep answers scoped.** For quick "where is X / what calls Y"
  questions use `graphify query "<q>" --depth 1` (or `--budget 1000`). Expand to
  `--depth 2` / `--budget 2000` only when the answer is truncated or the question
  is genuinely broad. Never read a whole source file to answer a question the
  graph can already scope.
- If `graphify-out/graph.json` exists, run `graphify query "<question>"` BEFORE
  the first grep/search/source-read for a codebase question. Read raw files
  only for lines the graph or an earlier read already located.
- If `graphify-out/wiki/index.md` exists, use it for broad navigation instead of raw source browsing.
- Read `graphify-out/GRAPH_REPORT.md` only for broad architecture review or when
  query/path/explain do not surface enough context.
- After modifying code, run `graphify update .`.
- `graphify-out/graph.json` is rewritten whole on every build, so a large diff to
  it in a PR is expected — do not flag it as churn.
