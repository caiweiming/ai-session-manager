import { useState } from "react";

export function useResizablePanels() {
  const [leftWidth, setLeftWidth] = useState(260);
  const [rightWidth, setRightWidth] = useState(400);
  return { leftWidth, rightWidth, setLeftWidth, setRightWidth };
}
