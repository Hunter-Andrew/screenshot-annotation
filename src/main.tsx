import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { selectBridge } from "./platform/select";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App bridge={selectBridge()} />
  </StrictMode>,
);
