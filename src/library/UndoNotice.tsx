/** "3 images moved to the Recycle Bin. Undo": no confirmation dialog first, a way back afterwards. */
export function UndoNotice({ count, onUndo }: { count: number; onUndo: () => void }) {
  return (
    <div className="undo-notice" role="group" aria-label="Deleted">
      <span>{count === 1 ? "1 image" : `${count} images`} moved to the Recycle Bin</span>
      <button type="button" aria-label="Undo delete" onClick={onUndo}>
        Undo
      </button>
    </div>
  );
}
