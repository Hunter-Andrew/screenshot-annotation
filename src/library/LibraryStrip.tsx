import { ImageCard } from "./ImageCard";
import type { LibraryImage } from "./libraryModel";
import type { ThumbnailLoader } from "./thumbnails";

interface Props {
  images: readonly LibraryImage[];
  /** The first listing has come back. */
  loaded: boolean;
  loader: ThumbnailLoader;
  currentPath: string | null;
  selected: ReadonlySet<string>;
  onClick: (event: React.MouseEvent, image: LibraryImage) => void;
  onCopy: (image: LibraryImage) => void;
  onDelete: (image: LibraryImage) => void;
  onShowAll: () => void;
  /** Collapsed to a thin bar (only the chevron shows), and the chevron's action. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

/** The Library Strip: thumbnails along the bottom of the editor, newest on the left, then "All captures (N)". */
export function LibraryStrip({ images, loaded, loader, currentPath, selected, onClick, onCopy, onDelete, onShowAll, collapsed = false, onToggleCollapsed }: Props) {
  const label = collapsed ? "Expand Library Strip" : "Collapse Library Strip";
  return (
    <section className={collapsed ? "library-strip collapsed" : "library-strip"} aria-label="Library Strip" data-collapsed={collapsed}>
      {onToggleCollapsed && (
        <button type="button" className="strip-chevron" aria-label={label} title={label} aria-expanded={!collapsed} onClick={onToggleCollapsed}>
          {collapsed ? "▴" : "▾"}
        </button>
      )}
      <div className="strip-scroll" hidden={collapsed} role="list" aria-label="Recent captures">
        {loaded && images.length === 0 && <span className="strip-empty">No captures yet</span>}
        {images.map((image) => (
          <ImageCard
            key={image.path}
            image={image}
            loader={loader}
            current={image.path === currentPath}
            selected={selected.has(image.path)}
            onClick={onClick}
            onCopy={onCopy}
            onDelete={onDelete}
          />
        ))}
      </div>
      <button type="button" className="all-captures" hidden={collapsed} onClick={onShowAll}>
        All captures ({images.length})
      </button>
    </section>
  );
}
