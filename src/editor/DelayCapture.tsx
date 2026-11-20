import { CAPTURE_DELAYS, type PlatformBridge } from "../platform/bridge";

/**
 * The delay timer's entry in the top bar: "3s". A click hides the editor, shows the countdown
 * near the mouse pointer and then opens the capture overlay (the platform runs all of that).
 */
export function DelayCapture({ bridge }: { bridge: PlatformBridge }) {
  return (
    <span className="delay-capture" role="group" aria-label="Capture after a delay">
      {CAPTURE_DELAYS.map((seconds) => (
        <button
          key={seconds}
          aria-label={`Capture in ${seconds} seconds`}
          title={`Capture in ${seconds} seconds`}
          onClick={() => void bridge.startDelayedCapture(seconds)}
        >
          {seconds}s
        </button>
      ))}
    </span>
  );
}
