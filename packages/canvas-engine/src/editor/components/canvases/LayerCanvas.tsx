import { useEffect, useRef } from "react";
import rough from "roughjs/bin/rough";
import type { RoughCanvas } from "roughjs/bin/canvas";
import type {
  NonDeletedEasyDrawElement,
  NonDeletedSceneElementsMap,
} from "../../element/types";
import { renderStaticScene } from "../../renderer/staticScene";
import type {
  RenderableElementsMap,
  StaticCanvasRenderConfig,
} from "../../scene/types";
import type { StaticCanvasAppState } from "../../types";

type LayerCanvasProps = {
  appState: StaticCanvasAppState;
  elementsMap: RenderableElementsMap;
  allElementsMap: NonDeletedSceneElementsMap;
  visibleElements: readonly NonDeletedEasyDrawElement[];
  scale: number;
  renderConfig: StaticCanvasRenderConfig;
};

/** Transparent static layer for page chrome and connectors above DOM embeds. */
const LayerCanvas = (props: LayerCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const roughCanvasRef = useRef<RoughCanvas | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    roughCanvasRef.current ??= rough.canvas(canvas);

    const scaledWidth = props.appState.width * props.scale;
    const scaledHeight = props.appState.height * props.scale;
    if (canvas.width !== scaledWidth) canvas.width = scaledWidth;
    if (canvas.height !== scaledHeight) canvas.height = scaledHeight;

    renderStaticScene(
      {
        canvas,
        rc: roughCanvasRef.current,
        scale: props.scale,
        elementsMap: props.elementsMap,
        allElementsMap: props.allElementsMap,
        visibleElements: props.visibleElements,
        appState: props.appState,
        renderConfig: {
          ...props.renderConfig,
          canvasBackgroundColor: "transparent",
          renderGrid: false,
          pendingFlowchartNodes: null,
          renderPageBackgrounds: false,
        },
      },
      false,
    );
  });

  return (
    <canvas
      ref={canvasRef}
      className="easydraw__canvas static connector-layer"
      style={{ width: props.appState.width, height: props.appState.height }}
    />
  );
};

export default LayerCanvas;
