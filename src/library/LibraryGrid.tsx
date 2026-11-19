import { defaultBindings, keyLabel } from "../shared/shortcutRegistry";
import { formatCombo } from "../settings/hotkey";
import { ImageCard } from "./ImageCard";
import { groupByDate, type LibraryImage } from "./libraryModel";
import type { ThumbnailLoader } from "./thumbnails";

interface Props {
  images: readonly LibraryImage[];
  loaded: boolean;
  loader: ThumbnailLoader;
  currentPath: string | null;
  selected: ReadonlySet<string>;
  /** The capture hotkey for the empty state; null until known. */
  hotkey: string | null;
  /** What day it is, for the headings (a prop so tests can fix it). */
  now: Date;
  /** The editor's status line ("Copied", "Restored 2 images"...), which the grid hides along with the rest. */
  status: string | null;
  onClick: (event: React.MouseEvent, image: LibraryImage) => void;
  onCopy: (image: LibraryImage) => void;
  onDelete: (image: LibraryImage) => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
  onBack: () => void;
}

/** The full-window grid of every capture, grouped under date headings. It replaces the editor window's contents. */
export function LibraryGrid(props: Props) {
  const { images, loaded, loader, currentPath, selected, hotkey, now, status } = props;
  const groups = groupByDate(images, now);
  const count = selected.size;
  return (
    <div className="library-grid" role="region" aria-label="All captures">
      <header className="grid-header">
        <strong>{images.length === 1 ? "1 capture" : `${images.length} captures`}</strong>
        {count > 0 && <span className="grid-selected">{count} selected</span>}
        {count > 0 && (
          <>
            <button type="button" className="danger" onClick={props.onDeleteSelected}>
              Delete {count}
            </button>
            <button type="button" onClick={props.onClearSelection}>
              Clear selection
            </button>
          </>
        )}
        <span className="spacer" />
        <span role="status" className="grid-status">
          {status}
        </span>
        <button type="button" onClick={props.onBack}>
          Back to editor ({keyLabel("editor.deselect", defaultBindings("editor"))})
        </button>
      </header>
      <div className="grid-body">
        {images.length === 0 ? (
          loaded && (
          <p className="empty">{hotkey ? `No captures yet. Press ${formatCombo(hotkey)} to take your first capture.` : "No captures yet."}</p>
          )
        ) : (
          groups.map((group) => (
            <section key={group.key} className="grid-group" aria-label={group.heading}>
              <h2>{group.heading}</h2>
              <div className="grid-cards" role="list">
                {group.images.map((image) => (
                  <ImageCard
                    key={image.path}
                    image={image}
                    loader={loader}
                    current={image.path === currentPath}
                    selected={selected.has(image.path)}
                    showDetails
                    onClick={props.onClick}
                    onCopy={props.onCopy}
                    onDelete={props.onDelete}
                  />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
