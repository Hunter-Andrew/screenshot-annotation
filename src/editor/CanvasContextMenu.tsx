// The menu a right-click on the canvas opens: Paste (Ctrl+V), Copy (Ctrl+C or the Copy button) and Copy original image.
import { useEffect, useRef } from "react";

export interface CanvasMenuItem {
  label: string;
  /** The key that does the same, shown on the right. */
  hint?: string;
  disabled?: boolean;
  onPick(): void;
}

interface Props {
  /** Where the pointer was, in window pixels. */
  at: { x: number; y: number };
  items: readonly CanvasMenuItem[];
  onClose(): void;
}

export function CanvasContextMenu({ at, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Closes on a press anywhere else, on Escape, and whenever the window changes under it.
  useEffect(() => {
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof MouseEvent && ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    window.addEventListener("mousedown", close, true);
    window.addEventListener("keydown", close, true);
    window.addEventListener("blur", close);
    window.addEventListener("resize", close);
    window.addEventListener("wheel", close, { passive: true, capture: true });
    return () => {
      window.removeEventListener("mousedown", close, true);
      window.removeEventListener("keydown", close, true);
      window.removeEventListener("blur", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("wheel", close, true);
    };
  }, [onClose]);
  // Kept inside the window: it opens up and to the left of the pointer when it would run off the bottom or the right.
  useEffect(() => {
    const menu = ref.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(0, Math.min(at.x, window.innerWidth - width))}px`;
    menu.style.top = `${Math.max(0, Math.min(at.y, window.innerHeight - height))}px`;
  }, [at]);
  return (
    <div className="context-menu" role="menu" aria-label="Canvas" ref={ref} style={{ left: at.x, top: at.y }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.onPick();
          }}
        >
          <span>{item.label}</span>
          {item.hint && <kbd>{item.hint}</kbd>}
        </button>
      ))}
    </div>
  );
}
