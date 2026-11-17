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
}

/** The Library Strip: thumbnails along the bottom of the editor, newest on the left, then "All captures (N)". */
export function LibraryStrip({ images, loaded, loader, currentPath, selected, onClick, onCopy, onDelete, onShowAll }: Props) {
  return (
    <section className="library-strip" aria-label="Library Strip">
      <div className="strip-scroll" role="list" aria-label="Recent captures">
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
      <button type="button" className="all-captures" onClick={onShowAll}>
        All captures ({images.length})
      </button>
    </section>
  );
}
