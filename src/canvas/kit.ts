// The real canvas kit. Fabric is imported on first use, so nothing that only needs the model (the
// Settings window, the overlay, unit tests) pays for it or needs a canvas.
import type { CanvasKit } from "./types";

export const fabricKit: CanvasKit = {
  mount: async (host, options) => (await import("./fabricCanvas")).createFabricCanvas(host, options),
  render: async (image, options) => (await import("./renderFinished")).renderFinished(image, options),
};
