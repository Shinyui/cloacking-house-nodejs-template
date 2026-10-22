# Graph Report - blank-template  (2026-10-22)

## Corpus Check
- Corpus is ~2,609 words - fits in a single context window. You may not need a graph.

## Summary
- 81 nodes · 129 edges · 6 communities
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: semantic input/output usage unavailable; AST uses zero model tokens.

## Community Hubs (Navigation)
- Request Handling and Tests
- Package Dependencies and Scripts
- Deployment and API Configuration
- Page Resolution and Rendering
- Server Startup and Configuration
- HTML Templates and Assets

## God Nodes (most connected - your core abstractions)
1. `FlowError` - 10 edges
2. `resolveDecision()` - 10 edges
3. `createApp()` - 9 edges
4. `Cloaking.House Blank Template` - 9 edges
5. `Cloaking.House API` - 6 edges
6. `getClientIp()` - 5 edges
7. `checkVisitor()` - 5 edges
8. `readLocalPage()` - 5 edges
9. `loadRemotePage()` - 5 edges
10. `Loading mode for remote or local HTML` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Loading mode for remote or local HTML` --references--> `Offer Page blank HTML template`  [EXTRACTED]
  README.md → pages/offer.html
- `Local White page fallback on API, IP, or page failure` --references--> `White Page blank HTML template`  [EXTRACTED]
  README.md → pages/white.html
- `config()` --calls--> `loadConfig()`  [EXTRACTED]
  test/template.test.js → src/config.js
- `Loading mode for remote or local HTML` --references--> `White Page blank HTML template`  [EXTRACTED]
  README.md → pages/white.html
- `White assets: public/assets/white/ served at /assets/white/` --conceptually_related_to--> `White Page blank HTML template`  [EXTRACTED]
  README.md → pages/white.html

## Import Cycles
- None detected.

## Communities (6 total, 0 thin omitted)

### Community 0 - "Request Handling and Tests"
Cohesion: 0.16
Nodes (7): express, createApp(), getClientIp(), normalizeIp(), buildRequestData(), checkVisitor(), decision

### Community 1 - "Package Dependencies and Scripts"
Cohesion: 0.11
Nodes (17): dependencies, express, parse5, devDependencies, @hapi/shot, engines, node, name (+9 more)

### Community 2 - "Deployment and API Configuration"
Cohesion: 0.17
Nodes (13): Cloaking.House API, Cloaking.House Blank Template, CLOAKING_LABEL flow configuration, Dockerfile container deployment, /healthz deployment health check, Iframe mode for Offer pages, IP_SOURCE=socket by default, Node.js 24 runtime (+5 more)

### Community 3 - "Page Resolution and Rendering"
Cohesion: 0.30
Nodes (12): absoluteUrl(), addBase(), assertHttpUrl(), browserTarget(), escapeAttribute(), FlowError, iframePage(), loadRemotePage() (+4 more)

### Community 4 - "Server Startup and Configuration"
Cohesion: 0.29
Nodes (3): loadConfig(), projectRoot, config()

### Community 5 - "HTML Templates and Assets"
Cohesion: 0.29
Nodes (5): Offer Page blank HTML template, White Page blank HTML template, Loading mode for remote or local HTML, Offer assets: public/assets/offer/ served at /assets/offer/, White assets: public/assets/white/ served at /assets/white/

## Knowledge Gaps
- **7 isolated node(s):** `Redirect mode with HTTP 302 to HTTP(S) URLs`, `Iframe mode for Offer pages`, `White assets: public/assets/white/ served at /assets/white/`, `Offer assets: public/assets/offer/ served at /assets/offer/`, `Node.js 24 runtime` (+2 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 36 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@hapi/shot` connect `Package Dependencies and Scripts` to `Request Handling and Tests`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **What connects `Redirect mode with HTTP 302 to HTTP(S) URLs`, `Iframe mode for Offer pages`, `White assets: public/assets/white/ served at /assets/white/` to the rest of the system?**
  _7 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Package Dependencies and Scripts` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Why does `parse5` connect `Package Dependencies and Scripts` to `Page Resolution and Rendering`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
## Extraction Audit Notes

- All 3 semantic files were read completely (README.md: 45 lines; pages/offer.html: 10 lines; pages/white.html: 10 lines).
- Token accounting: AST extraction used no model tokens. The semantic agent tool exposes no token usage; the generated zero input/output counters are placeholders for unavailable measurements. Actual semantic token counts and monetary cost are unknown.
- Graph health warning: 2 endpoint pairs in test/template.test.js each have both contains and calls relationships; the default graph collapsed these from 131 extracted edges to 129 graph edges. No missing/dangling endpoints or self-loops were found. See graph-health.json for details.
- Full extraction evidence, including the relationships collapsed in the visualization, is preserved in extraction-audit.json.
- External-reference stubs account for the difference between 71 extracted nodes and 81 final graph nodes.
