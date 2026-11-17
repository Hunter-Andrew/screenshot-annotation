// Every Annotation type's Fabric adapter. A new tool adds one line here.
import type { Annotation } from "../../core/annotation";
import { arrowAdapter } from "./arrow";
import { ellipseAdapter } from "./ellipse";
import { highlightAdapter } from "./highlight";
import { lineAdapter } from "./line";
import { penAdapter } from "./pen";
import { rectAdapter } from "./rect";
import type { ShapeAdapter } from "./shape";
import { textAdapter } from "./text";

const ADAPTERS: readonly ShapeAdapter<any>[] = [
  arrowAdapter,
  lineAdapter,
  rectAdapter,
  ellipseAdapter,
  textAdapter,
  penAdapter,
  highlightAdapter,
];

export function adapterFor(type: Annotation["type"] | string): ShapeAdapter | undefined {
  return ADAPTERS.find((a) => a.type === type);
}

export type { ShapeAdapter } from "./shape";
