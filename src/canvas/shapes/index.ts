// Every Annotation type's Fabric adapter. A new tool adds one line here.
import type { Annotation } from "../../core/annotation";
import { arrowAdapter } from "./arrow";
import { ellipseAdapter } from "./ellipse";
import { lineAdapter } from "./line";
import { rectAdapter } from "./rect";
import type { ShapeAdapter } from "./shape";

const ADAPTERS: readonly ShapeAdapter<any>[] = [
  arrowAdapter,
  lineAdapter,
  rectAdapter,
  ellipseAdapter,
  // textAdapter, (ticket 11)
  // penAdapter, (ticket 12)
];

export function adapterFor(type: Annotation["type"] | string): ShapeAdapter | undefined {
  return ADAPTERS.find((a) => a.type === type);
}

export type { ShapeAdapter } from "./shape";
