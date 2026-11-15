// Loads thumbnails for the Library Strip and grid through the Platform bridge (ticket 14): a few at a
// time (a grid may ask for dozens), each shown as an object URL, remembered so scrolling back or
// switching views does not ask again, and cancellable so thumbnails that scrolled away are never made.
import type { PlatformBridge } from "../platform/bridge";
import type { LibraryImage } from "./libraryModel";

export interface ThumbnailLoader {
  /** The thumbnail URL for this version of the image if it has been loaded already. */
  peek(image: LibraryImage): string | null;
  /**
   * Load the thumbnail (or hand back the remembered one). `onUrl` is called once with an object URL.
   * `onError` is called if the platform cannot make one. Returns a function that cancels the request
   * if it has not started.
   */
  request(image: LibraryImage, onUrl: (url: string) => void, onError: () => void): () => void;
  /** Revoke every URL; the loader is finished. */
  dispose(): void;
}

/** Thumbnails fetched at once. */
export const THUMBNAIL_CONCURRENCY = 3;
/** Thumbnails remembered; the least recently used go first. */
export const THUMBNAIL_CACHE_SIZE = 300;

/** A thumbnail is for one version of one file: it is made again when the file changes. */
export function thumbnailKey(image: Pick<LibraryImage, "path" | "modifiedMs" | "bytes">): string {
  return `${image.path}\u0000${image.modifiedMs}\u0000${image.bytes}`;
}

interface Job {
  image: LibraryImage;
  key: string;
  waiting: { onUrl: (url: string) => void; onError: () => void; cancelled: boolean }[];
}

export function createThumbnailLoader(
  bridge: Pick<PlatformBridge, "getThumbnail">,
  options: { concurrency?: number; cacheSize?: number } = {},
): ThumbnailLoader {
  const concurrency = options.concurrency ?? THUMBNAIL_CONCURRENCY;
  const cacheSize = options.cacheSize ?? THUMBNAIL_CACHE_SIZE;
  // A Map keeps insertion order, so re-inserting on use makes the first entry the least recently used.
  const urls = new Map<string, string>();
  const jobs = new Map<string, Job>();
  const queue: Job[] = [];
  let running = 0;
  let disposed = false;

  const remember = (key: string, url: string) => {
    urls.delete(key);
    urls.set(key, url);
    while (urls.size > cacheSize) {
      const [oldest, url] = urls.entries().next().value as [string, string];
      urls.delete(oldest);
      URL.revokeObjectURL(url);
    }
  };

  const pump = () => {
    while (running < concurrency && queue.length > 0) {
      const job = queue.shift()!;
      if (job.waiting.every((w) => w.cancelled)) {
        jobs.delete(job.key); // everyone who wanted it scrolled away
        continue;
      }
      running++;
      bridge.getThumbnail(job.image.path).then(
        (png) => {
          if (disposed) return;
          const url = URL.createObjectURL(new Blob([png as BlobPart], { type: "image/png" }));
          remember(job.key, url);
          job.waiting.filter((w) => !w.cancelled).forEach((w) => w.onUrl(url));
        },
        () => job.waiting.filter((w) => !w.cancelled).forEach((w) => w.onError()),
      ).finally(() => {
        running--;
        jobs.delete(job.key);
        if (!disposed) pump();
      });
    }
  };

  return {
    peek(image) {
      const key = thumbnailKey(image);
      const url = urls.get(key);
      if (url === undefined) return null;
      remember(key, url);
      return url;
    },
    request(image, onUrl, onError) {
      const key = thumbnailKey(image);
      const known = urls.get(key);
      if (known !== undefined) {
        remember(key, known);
        onUrl(known);
        return () => {};
      }
      const waiting = { onUrl, onError, cancelled: false };
      let job = jobs.get(key);
      if (job) job.waiting.push(waiting);
      else {
        job = { image, key, waiting: [waiting] };
        jobs.set(key, job);
        queue.push(job);
      }
      pump();
      return () => {
        waiting.cancelled = true;
      };
    },
    dispose() {
      disposed = true;
      queue.length = 0;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    },
  };
}
