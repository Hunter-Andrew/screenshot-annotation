import type { PlatformBridge } from "./bridge";

export interface FakeBridge extends PlatformBridge {
  /** URLs passed to openUrl, in order. */
  readonly openedUrls: string[];
}

export function createFakeBridge(options: { version?: string } = {}): FakeBridge {
  const openedUrls: string[] = [];
  return {
    openedUrls,
    getVersion: async () => options.version ?? "0.0.0-fake",
    openUrl: async (url) => {
      openedUrls.push(url);
    },
  };
}
