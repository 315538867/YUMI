## Context

See `proposal.md` for motivation and `specs/**/spec.md` for behavioral contracts. The renderer currently imports DayPicker plus `tokens.css`, `base.css`, `components.css`, and `pages.css` in JavaScript order. Shared `Yumi*` components are widely used, but final composition remains controlled by large cross-cutting CSS files, page-private layout rules, and source-string tests.

The application is an Electron desktop product with a configured `1440 × 920` default window and `1100 × 720` minimum outer bounds. Radix Dialog, Sheet, Popover and Select content uses Portal, so page-root CSS inheritance does not reach every rendered control. The repository also contains current user WIP in the reports area that must remain untouched unless a later page-family task explicitly includes and separates it.

## Goals / Non-Goals

**Goals:**

- Make UI ownership explicit from Foundations through Domains and prevent reverse dependencies.
- Give every top-level business page one Pattern root, one density owner and one scroll hierarchy.
- Preserve semantic component composition while preventing consumers from overriding shared internals.
- Make migration incremental, reversible by page family and enforceable with ratcheting guardrails.
- Verify user-visible behavior at actual Electron viewport sizes with deterministic data.

**Non-Goals:**

- Replacing React, Radix, DayPicker or Lucide.
- Supporting mobile or tablet workflows below the configured desktop minimum.
- Changing database schemas, IPC contracts, domain calculations, lifecycle rules, permissions, operator decisions or export data semantics.
- Maintaining compatibility props, legacy CSS aliases, dual component implementations or adapter layers after a call site is migrated.
- Refactoring unrelated application services while migrating visual structure.

## Decisions

### 1. Use five directional UI layers

The renderer will use Foundations → Primitives → Composites → Patterns → Domains. Higher layers may consume lower layers; lower layers must not import domain or page behavior.

Foundations own tokens and global element defaults. Primitives own individual controls. Composites own stable multi-control relationships and semantic slots. Patterns own top-level page order, density and desktop behavior. Domains own business-specific content and intrinsic geometry.

Alternative considered: keep `components.css` and `pages.css` and add more naming rules. Rejected because file boundaries do not express ownership, existing aliases remain unused, and page selectors can continue overriding shared components.

### 2. Use one layered CSS entry

`src/renderer/styles/index.css` will be the only renderer UI style import. It will declare `reset, vendor, foundations, primitives, composites, patterns, domains, utilities` in fixed order and load DayPicker into `vendor`. The migration must first prove the current build supports layered package imports; the JavaScript DayPicker import is removed only after the replacement build and render test pass.

Domain CSS may use grid, flex and named local custom properties for business geometry, but cannot target shared internal classes or duplicate layout primitives. Utilities are restricted to approved accessibility and diagnostics use.

Alternative considered: rely on JavaScript import order. Rejected because splitting files would make precedence depend on incidental module order and would not prevent unlayered third-party rules from outranking local layers.

### 3. Separate raw scales from semantic aliases

Foundation tokens will contain raw scales for color, typography, spacing, dimensions, radii, shadows, motion and z-index. Components and Patterns consume semantic aliases such as control height, field gap, section gap, panel padding and overlay padding. Domain-specific dimensions use narrowly scoped names and an allowlist; generic spacing, color and control dimensions are not allowed in that list.

The Electron window background and renderer canvas must use a shared TypeScript theme constant or a synchronization test, because main-process code cannot consume CSS custom properties directly.

Alternative considered: allow local numeric values when visually correct. Rejected because this recreates the current drift and prevents mechanical governance.

### 4. Make Pattern density Portal-safe

Each top-level Pattern root emits `data-page-pattern` and `data-density` and provides density through React context. Normal descendants consume CSS semantic variables. Portal-based composites read the context and emit density on their content root, so Dialog, Sheet, Popover and Select do not fall back when mounted outside the page subtree.

Standalone component tests use a documented default. Explicit density props remain only where the component contract genuinely supports standalone rendering; production pages do not use them to override Pattern ownership.

Alternative considered: copy `data-density` to `document.body`. Rejected because simultaneous nested or system overlays could overwrite global state and because density ownership would no longer be local to the rendered content.

### 5. Preserve semantic slots but own their containers

Composites may expose `title`, `description`, `status`, `actions`, `footer` and `children` when each slot has a stable semantic role. The component owns wrapper elements, ordering, alignment, spacing and responsive behavior. Consumers cannot inject class or style hooks that modify shared internals.

Alternative considered: ban all ReactNode slots in favor of scalar props. Rejected because existing headers, sections, summaries and overlays need composable domain content, and forcing every variation into scalar props would create unnecessary API churn.

### 6. Restrict Pattern roots to top-level pages

Route-level pages and direct AppShell workspaces own one Pattern root and one primary scrolling hierarchy. Embedded modes such as personnel or assignment views render as Domain or Composite content without another PageHeader, Pattern root or page scroll container.

Seven Pattern components cover List Page, Detail Page, Form Workspace, Dashboard Overview, Review Workspace, Calendar Workspace and Settings Workspace. Patterns expose structured regions rather than page-specific data APIs.

Alternative considered: let every exported `*Page` component emit a Pattern root. Rejected because several current page components also run embedded and would create nested density, headers and scroll ownership.

### 7. Ratchet governance instead of failing legacy code globally

P0 captures violations by file, category and location and blocks any expansion. P1 enables strict checks for migrated Foundations, Primitives and Composites. P2 enables strict Pattern checks. P3 clears and locks each Domain page family. Repository-wide zero-violation enforcement activates only after all families migrate.

Existing source-string checks remain useful for dependency and forbidden-import rules but do not prove rendered composition. Contract tests will render components and Patterns to verify state, ARIA, focus restoration, Portal density, stable message slots and overflow behavior.

Alternative considered: enable zero-tolerance rules in P0. Rejected because the current files contain known legacy values and protected WIP, so immediate strictness would either block all work or force an unsafe broad rewrite.

### 8. Migrate shared APIs only at atomic boundaries

P1 is split into narrow shared-capability batches. Non-breaking internal replacements can land after all current pages pass. A props, DOM ownership or layout responsibility change must update all call sites in the same atomic change, or wait for the first P3 family that can own the complete migration. No temporary compatibility props or dual implementations are introduced.

Each P3 family starts with a feature matrix and screenshots, migrates the whole top-level page, validates behavior and windows, then deletes old JSX and CSS. A failed family is reverted to its pre-migration checkpoint instead of being patched with a compatibility layer.

Alternative considered: maintain v1 and v2 components during migration. Rejected because dual systems would make ownership ambiguous and prolong the inconsistency this change is intended to remove.

### 9. Validate with deterministic Electron scenarios

Visual baselines use versioned fixtures or an isolated test database with fixed dates, timezone, ordering and random values. Each result records both BrowserWindow outer bounds and renderer `innerWidth × innerHeight`; media and container behavior is judged against the actual viewport. Real user data may be inspected read-only for density realism but is never the reproducible baseline.

The three acceptance bounds are `1100 × 720`, `1440 × 920` and `1920 × 1080`. P0 records their actual renderer viewports and finalizes the two supported breakpoint values before Pattern CSS is frozen.

Alternative considered: browser-only screenshots at nominal CSS widths. Rejected because macOS title-bar and Electron frame dimensions can make the real renderer viewport smaller than the configured outer bounds.

### 10. Preserve business behavior explicitly

UI tasks may reorganize presentation and entry placement but must retain existing operations and data semantics. In addition to per-page feature matrices, the existing order → production → timed work → edge sewing/packing → partial shipment → payroll → finance/reporting chain remains a required regression path.

The reports WIP present when this proposal was created is protected. Work touching the same files must separate its hunks and may include those changes only when explicitly authorized as part of the relevant page-family migration.

## Risks / Trade-offs

- [Layered package CSS is not supported by the current build path] → Prove DayPicker layered import with a focused build/render test before switching `main.tsx`; retain the current import until that test passes.
- [Changing shared tokens alters every legacy page before P3] → Land token/component work in narrow batches and run renderer-wide visual smoke checks for each batch.
- [Portal density differs from its trigger page] → Add context/content-root contract tests for every Portal-based Composite.
- [A broad guardrail baseline hides new violations through count balancing] → Store file, category and location entries rather than aggregate counts.
- [Page-family migration drops a low-frequency action or state] → Capture entry, data, filter, create/edit, state transition, export, error, keyboard and return-context matrices before editing.
- [Window bounds do not equal usable viewport] → Record actual renderer dimensions in Electron at each acceptance size and lock breakpoints from those measurements.
- [Visual fixtures diverge from realistic data volume] → Include long Chinese labels, maximum amounts, multiple actions and overflow cases; supplement with read-only real-data inspection when needed.
- [Protected reports WIP overlaps first migration family] → Keep it out of P0/P1 commits and require explicit hunk review before any reports migration.
- [Full migration is lengthy] → Keep every completed family independently releasable and enforce strict rules only for completed ownership scopes.

## Migration Plan

1. **P0, baseline and evidence:** inventory exports, page roots, style violations and current behavior; create deterministic fixtures; capture three-window screenshots and actual viewports; establish incremental guardrails and feature matrices.
2. **P1, shared system:** introduce token scales and semantic aliases, prove and adopt the layered CSS entry, synchronize the Electron canvas, implement density context and Portal propagation, migrate Primitives/Composites/layout primitives in bounded batches, remove five unused exports, and update shared contract tests.
3. **P2, page Patterns:** implement and test seven Pattern roots with fixed region order, density, loading/empty/error/overflow behavior and actual desktop viewport adaptation. Validate that embedded views do not create nested Patterns.
4. **P3, page families:** migrate reports → settings → orders → scheduling/review → finance/payroll/dashboard → customers/products/workers. For each family, establish a checkpoint, migrate the entire page, verify its feature matrix and Electron screenshots, then remove legacy JSX/CSS and enable strict Domain checks.
5. Run renderer regression, lint/format checks, independent TypeScript checking, build, Electron interaction checks and the critical business path at each applicable gate. Avoid test commands that disturb the native `better-sqlite3` ABI.
6. After the final family, remove the P0 baseline allowance and activate repository-wide zero legacy class, raw visual value and private breakpoint enforcement.

Rollback is page-family or bounded shared-batch rollback to the recorded pre-change checkpoint. Rollback never restores removed APIs through a compatibility layer; the incomplete atomic batch is reverted as a whole while previously accepted families remain intact.
