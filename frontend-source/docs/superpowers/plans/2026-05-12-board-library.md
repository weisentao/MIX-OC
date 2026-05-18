# Board Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the single project board into a board library where project scopes and module scopes can each contain multiple isolated boards.

**Architecture:** Keep board domain rules in `src/features/collab-board/boardModel.js`, expose scope-aware actions from the Pinia workspace store, and let Vue components open a lightweight board library before mounting Excalidraw. Existing `board-project-<projectId>` boards remain valid and become the default project board for their scope.

**Tech Stack:** Vue 3, Pinia, Excalidraw React island, Node test runner.

---

### Task 1: Model Tests

**Files:**
- Modify: `G:\mutou\xm\xjg\src\features\collab-board\__tests__\boardModel.test.js`

- [ ] **Step 1: Add tests for board scopes and multiple boards**

Add tests that assert:
- Project default board uses scope key `project:<projectId>`.
- Module default board uses scope key `module:<projectId>:<moduleKey>`.
- Creating named boards in the same scope produces unique board IDs and keeps them isolated.
- Listing boards by scope excludes boards from other project/module scopes.

- [ ] **Step 2: Run tests and verify failure**

Run: `npm run test:boards`

Expected: FAIL because the new board library functions do not exist yet.

### Task 2: Board Model

**Files:**
- Modify: `G:\mutou\xm\xjg\src\features\collab-board\boardModel.js`

- [ ] **Step 1: Add scope helpers**

Implement `getBoardScopeKey`, `boardIdForScope`, `createBoardScope`, and `listBoardsForScope`.

- [ ] **Step 2: Add multi-board creation**

Implement `createScopedBoard` and `ensureDefaultBoardForScope`. Preserve `createProjectBoard` and `ensureProjectBoard` as compatibility wrappers.

- [ ] **Step 3: Run model tests**

Run: `npm run test:boards`

Expected: PASS.

### Task 3: Store Actions And Getters

**Files:**
- Modify: `G:\mutou\xm\xjg\src\data\seed.js`
- Modify: `G:\mutou\xm\xjg\src\stores\workspace\getters.js`
- Modify: `G:\mutou\xm\xjg\src\stores\workspace\actions\boardActions.js`

- [ ] **Step 1: Add board library state**

Add `activeBoardScope: null`, `boardLibraryOpen: false`, and `boardCreateMode: false` to initial state.

- [ ] **Step 2: Add scope-aware getters**

Add getters for `activeBoardScopeBoards` and current scope label. Keep `activeBoard` and history behavior unchanged.

- [ ] **Step 3: Add scope-aware actions**

Add `openBoardLibrary`, `openScopedBoard`, `createBoardInActiveScope`, and `closeBoardLibrary`. Update `openActiveProjectBoard` and module opening to use scopes.

- [ ] **Step 4: Run tests**

Run: `npm run test:boards`

Expected: PASS.

### Task 4: UI

**Files:**
- Modify: `G:\mutou\xm\xjg\src\components\layout\WorkbenchHeader.vue`
- Modify: `G:\mutou\xm\xjg\src\components\tasks\TaskModule.vue`
- Modify: `G:\mutou\xm\xjg\src\components\boards\CollabBoardOverlay.vue`
- Modify: `G:\mutou\xm\xjg\src\styles\overrides.css`

- [ ] **Step 1: Project entry opens project board library**

Wire top project board button to `openBoardLibrary({ scopeType: "project" })`.

- [ ] **Step 2: Module entry opens module board library**

Wire module board buttons to `openBoardLibrary({ scopeType: "module", module })`.

- [ ] **Step 3: Overlay shows board library before canvas**

When multiple boards exist or no board is selected, show cards for boards in the active scope plus a create form. Opening a board mounts Excalidraw.

- [ ] **Step 4: Style the library**

Add compact operational styles for board cards, scope labels, creation input, and empty state.

### Task 5: Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run model tests**

Run: `npm run test:boards`

Expected: PASS.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: PASS. Known chunk-size warnings from Excalidraw are acceptable.

- [ ] **Step 3: Restart dev services**

Restart `xjg-api` on `3001` and Vite on `5177` so the user tests the latest code.
