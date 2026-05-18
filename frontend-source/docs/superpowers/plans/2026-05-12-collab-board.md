# Collab Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a project-level collaborative drawing board entry and UI in the existing Vue workspace, backed by local store persistence, permission handling, and 30-day version history.

**Architecture:** The first version uses the existing Pinia workspace state as the source of truth so it is testable without a new backend service. Excalidraw is embedded as a React island inside a Vue overlay component, with a simple Vue fallback canvas if the package fails to mount.

**Tech Stack:** Vue 3, Pinia, Vite, React 18, `@excalidraw/excalidraw`, Node built-in test runner.

---

## File Structure

- Create `src/features/collab-board/boardModel.js`: pure functions for board creation, permissions, snapshots, 30-day retention, and restore.
- Create `src/features/collab-board/__tests__/boardModel.test.js`: Node tests for the pure board model.
- Create `src/features/collab-board/ExcalidrawIsland.jsx`: React component wrapping Excalidraw.
- Create `src/components/boards/CollabBoardOverlay.vue`: Vue full-screen board shell.
- Modify `src/data/seed.js`: add `boards` and `boardHistory` to initial state.
- Modify `src/stores/workspace/getters.js`: expose active board and board capabilities.
- Modify `src/stores/workspace/actions/index.js`: include new board actions.
- Create `src/stores/workspace/actions/boardActions.js`: open board, save board, restore history, close board.
- Modify `src/components/layout/WorkbenchHeader.vue`: add project-level board button.
- Modify `src/views/WorkspaceView.vue`: mount overlay and wire header event.
- Modify `src/styles/overrides.css`: add board overlay and button styling.
- Modify `package.json`: add `test:boards` script.

## Task 1: Board Model

- [ ] Write failing tests for automatic board creation, readonly view mode, 30-day pruning, and restore.
- [ ] Run `npm run test:boards` and verify it fails because `boardModel.js` is missing.
- [ ] Implement `boardModel.js` with minimal pure functions.
- [ ] Run `npm run test:boards` and verify it passes.

## Task 2: Store Integration

- [ ] Add initial board state to `createInitialState()`.
- [ ] Add getters for `activeBoard`, `activeBoardSnapshots`, and `canEditBoard`.
- [ ] Add board actions that call the pure model.
- [ ] Run `npm run test:boards` and `npm run build`.

## Task 3: UI Integration

- [ ] Add a board button in `WorkbenchHeader`.
- [ ] Add `CollabBoardOverlay.vue` and wire it in `WorkspaceView.vue`.
- [ ] Add `ExcalidrawIsland.jsx` and pass initial data, view mode, change callbacks.
- [ ] Add CSS for a dense workbench-style overlay.
- [ ] Run `npm run build`.

## Task 4: Manual Verification

- [ ] Start Vite dev server.
- [ ] Open the app and verify the board button appears on project pages.
- [ ] Open the board and confirm project name, role, save status, history panel, and return button.
- [ ] Confirm build output remains portable under `G:\mutou\xm\xjg\dist`.
