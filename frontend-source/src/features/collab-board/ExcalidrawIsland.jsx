import React, { useMemo, useRef } from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";

const APP_STATE_KEYS = [
  "viewBackgroundColor",
  "currentItemStrokeColor",
  "currentItemBackgroundColor",
  "currentItemFillStyle",
  "currentItemStrokeWidth",
  "currentItemStrokeStyle",
  "currentItemRoughness",
  "currentItemOpacity",
  "currentItemFontFamily",
  "currentItemFontSize",
  "currentItemTextAlign",
  "currentItemStartArrowhead",
  "currentItemEndArrowhead",
  "theme",
  "gridSize",
  "name"
];

function clonePlain(value, fallback) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch {
    return fallback;
  }
}

function sanitizeAppState(appState = {}) {
  return APP_STATE_KEYS.reduce((result, key) => {
    if (appState[key] !== undefined) result[key] = appState[key];
    return result;
  }, { viewBackgroundColor: "#ffffff" });
}

function BoardCanvas({ board, readonly, onChange }) {
  const skippedInitialChange = useRef(false);
  const initialData = useMemo(
    () => ({
      elements: clonePlain(board?.elements, []),
      appState: {
        ...sanitizeAppState(board?.appState),
        collaborators: new Map()
      },
      files: clonePlain(board?.files, {})
    }),
    [board?.id, board?.updatedAt]
  );

  return (
    <Excalidraw
      initialData={initialData}
      langCode="zh-CN"
      viewModeEnabled={readonly}
      isCollaborating={true}
      onChange={(elements, appState, files) => {
        if (readonly) return;
        if (!skippedInitialChange.current) {
          skippedInitialChange.current = true;
          return;
        }
        onChange?.({
          elements: clonePlain(elements, []),
          appState: sanitizeAppState(appState),
          files: clonePlain(files, {})
        });
      }}
    />
  );
}

export function mountExcalidrawBoard(container, props) {
  const root = createRoot(container);
  root.render(<BoardCanvas {...props} />);
  return root;
}

export function unmountExcalidrawBoard(root) {
  root?.unmount();
}
