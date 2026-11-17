import { useEffect, useRef, useState } from "react";
import { formatTime, formatWhen, type LibraryImage } from "./libraryModel";
import type { ThumbnailLoader } from "./thumbnails";

/** One thumbnail. It asks for its picture only once it is (nearly) on screen, so a long Library stays quick. */
function Thumb({ image, loader }: { image: LibraryImage; loader: ThumbnailLoader }) {
  const box = useRef<HTMLSpanElement>(null);
  // Without IntersectionObserver (tests) everything counts as on screen.
  const [near, setNear] = useState(typeof IntersectionObserver === "undefined");
  const [url, setUrl] = useState<string | null>(() => loader.peek(image));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (near || !box.current) return;
    const observer = new IntersectionObserver(
      (entries) => entries.some((e) => e.isIntersecting) && setNear(true),
      { rootMargin: "300px" },
    );
    observer.observe(box.current);
    return () => observer.disconnect();
  }, [near]);

  const { path, modifiedMs, bytes } = image;
  useEffect(() => {
    if (!near) return;
    setFailed(false);
    // Keeps showing the old picture while a new version of the file loads: no flash on every auto-save.
    return loader.request(image, setUrl, () => setFailed(true));
    // `image` is rebuilt on every refresh; only these fields say whether the picture is stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, loader, path, modifiedMs, bytes]);

  return (
    <span className="lib-thumb" ref={box} data-state={url ? "ready" : failed ? "failed" : "loading"}>
      {url ? <img src={url} alt="" draggable={false} /> : failed ? <span className="lib-failed">No preview</span> : null}
    </span>
  );
}

export interface ImageCardProps {
  image: LibraryImage;
  loader: ThumbnailLoader;
  /** This is the image open in the editor. */
  current: boolean;
  /** Part of the multi-selection. */
  selected: boolean;
  /** The grid shows each image's time and pixel size under it. */
  showDetails?: boolean;
  onClick: (event: React.MouseEvent, image: LibraryImage) => void;
  onCopy: (image: LibraryImage) => void;
  onDelete: (image: LibraryImage) => void;
}

/** A thumbnail with its hover Copy and ✕ buttons: the same in the strip and the grid. */
export function ImageCard({ image, loader, current, selected, showDetails, onClick, onCopy, onDelete }: ImageCardProps) {
  const when = formatWhen(image.capturedAt);
  return (
    <div className="lib-card" role="listitem" data-current={current} data-selected={selected}>
      <button
        type="button"
        className="lib-open"
        aria-label={`Open image from ${when}`}
        aria-current={current ? "true" : undefined}
        aria-pressed={selected}
        onClick={(event) => onClick(event, image)}
      >
        <Thumb image={image} loader={loader} />
        {showDetails && (
          <span className="lib-details">
            {formatTime(image.capturedAt)} · {image.width}×{image.height}
          </span>
        )}
      </button>
      <span className="lib-hover">
        <button type="button" aria-label={`Copy image from ${when}`} title="Copy" onClick={() => onCopy(image)}>
          Copy
        </button>
        <button type="button" aria-label={`Delete image from ${when}`} title="Delete" onClick={() => onDelete(image)}>
          ✕
        </button>
      </span>
    </div>
  );
}
