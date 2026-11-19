import { fireEvent, render, screen } from "@testing-library/react";
import type { PlatformBridge } from "../platform/bridge";
import { Settings } from "./Settings";

/** Renders Settings and opens the keyboard shortcuts screen ("Bind keyboard shortcuts…"), where every hotkey setting lives. */
export function renderShortcuts(bridge: PlatformBridge) {
  const result = render(<Settings bridge={bridge} />);
  fireEvent.click(screen.getByRole("button", { name: "Bind keyboard shortcuts…" }));
  return result;
}
