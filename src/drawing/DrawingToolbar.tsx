import { useEffect, useRef, useState } from "react";
import "./toolbar.css";
import type { PlatformBridge } from "../platform/bridge";
import { DRAWING_TOOLBAR_COLLAPSED_SIZE, DRAWING_TOOLBAR_SIZE } from "../shared/constants";
import { DRAWING_TOOLS, type DrawingTool } from "./drawingState";
import { ToolbarIcon } from "./toolbarIcons";
import {
  canUndo,
  initialToolbarState,
  recordEdit,
  selectTool,
  TOOLBAR_BUTTONS,
  toggleCollapsed,
  toggleUseApps,
  undoTarget,
  type ToolbarState,
} from "./toolbarState";

const isTool = (id: string): id is DrawingTool => (DRAWING_TOOLS as readonly string[]).includes(id);

/**
 * The Drawing mode toolbar (ticket 53): a Teams-style pill of icon buttons in a small always-on-top window of its
 * own. The platform opens it top-centre on the monitor under the mouse, never gives it keyboard focus (so the
 * overlay keeps the keys), keeps it out of captures, and lets it be dragged (`data-tauri-drag-region`, on the pill's
 * background and the grip). The window talks to the overlays only through the bridge: the tool is chosen there and
 * remembered, Undo asks the overlay that drew last, and "Use apps" makes the overlays click-through.
 */
export function DrawingToolbar({ bridge }: { bridge: PlatformBridge }) {
  const [state, setState] = useState<ToolbarState>(() => initialToolbarState());
  // What the platform was last told, so a change is sent once and the first render sends nothing.
  const sent = useRef({ useApps: false, collapsed: false });

  useEffect(() => {
    document.documentElement.style.background = "transparent";
    document.body.style.background = "transparent";
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
  }, []);

  useEffect(() => {
    let alive = true;
    let heardEvent = false;
    const offs: (() => void)[] = [];
    const log = (what: string) => (e: unknown) => void bridge.logOverlay(`drawing toolbar: ${what} failed: ${e}`);
    const keep = (subscription: Promise<() => void>) =>
      void subscription.then((off) => (alive ? offs.push(off) : off()), log("subscribing"));
    keep(
      bridge.onDrawingTool((tool) => {
        heardEvent = true;
        if (alive) setState((s) => selectTool(s, tool));
      }),
    );
    keep(bridge.onDrawingEdit((edit) => alive && setState((s) => recordEdit(s, edit))));
    bridge.getDrawingTool().then((tool) => alive && !heardEvent && setState((s) => selectTool(s, tool)), log("getDrawingTool"));
    return () => {
      alive = false;
      offs.forEach((off) => off());
    };
  }, [bridge]);

  useEffect(() => {
    if (sent.current.useApps === state.useApps) return;
    sent.current.useApps = state.useApps;
    bridge.setDrawingClickThrough(state.useApps).catch((e) => void bridge.logOverlay(`drawing toolbar: setDrawingClickThrough failed: ${e}`));
  }, [bridge, state.useApps]);

  useEffect(() => {
    if (sent.current.collapsed === state.collapsed) return;
    sent.current.collapsed = state.collapsed;
    const size = state.collapsed ? DRAWING_TOOLBAR_COLLAPSED_SIZE : DRAWING_TOOLBAR_SIZE;
    bridge.resizeDrawingToolbar(size.width, size.height).catch((e) => void bridge.logOverlay(`drawing toolbar: resizeDrawingToolbar failed: ${e}`));
  }, [bridge, state.collapsed]);

  const choose = (tool: DrawingTool) => {
    setState((s) => selectTool(s, tool));
    bridge.setDrawingTool(tool).catch((e) => void bridge.logOverlay(`drawing toolbar: setDrawingTool failed: ${e}`));
  };
  const undoLast = () => {
    const monitor = undoTarget(state);
    if (monitor !== null) bridge.undoDrawing(monitor).catch((e) => void bridge.logOverlay(`drawing toolbar: undoDrawing failed: ${e}`));
  };
  const exit = () => bridge.exitDrawingMode().catch((e) => void bridge.logOverlay(`drawing toolbar: exitDrawingMode failed: ${e}`));

  const grip = (
    <div data-grip data-tauri-drag-region aria-hidden="true">
      <span />
    </div>
  );

  if (state.collapsed) {
    return (
      <div className="drawing-toolbar" role="toolbar" aria-label="Drawing tools" data-tauri-drag-region>
        {grip}
        <button type="button" aria-label="Expand" title="Expand" onClick={() => setState(toggleCollapsed)}>
          <ToolbarIcon id="expand" />
        </button>
      </div>
    );
  }

  return (
    <div className="drawing-toolbar" role="toolbar" aria-label="Drawing tools" data-tauri-drag-region>
      {grip}
      {TOOLBAR_BUTTONS.map((item, index) => {
        if (item.kind === "divider") return <div key={`divider-${index}`} role="separator" aria-orientation="vertical" />;
        const title = item.key ? `${item.label} (${item.key})` : item.label;
        const common = { type: "button" as const, "aria-label": item.label, title, "data-kind": isTool(item.id) ? "tool" : item.id };
        if (isTool(item.id)) {
          const tool = item.id;
          return (
            <button key={item.id} {...common} aria-pressed={state.tool === tool} onClick={() => choose(tool)}>
              <ToolbarIcon id={item.id} />
            </button>
          );
        }
        if (item.id === "useApps") {
          return (
            <button key={item.id} {...common} aria-pressed={state.useApps} onClick={() => setState(toggleUseApps)}>
              <ToolbarIcon id={item.id} />
            </button>
          );
        }
        const onClick = item.id === "undo" ? undoLast : item.id === "collapse" ? () => setState(toggleCollapsed) : exit;
        return (
          <button key={item.id} {...common} disabled={item.id === "undo" && !canUndo(state)} onClick={onClick}>
            <ToolbarIcon id={item.id} />
          </button>
        );
      })}
    </div>
  );
}
