import React, { useState } from "react";
import { parseSvgVector } from "../../src/features/assets/svg-vector";
import { createRoot } from "react-dom/client";
import {
  EasyDrawCanvas, restoreElements, newElementWith, CaptureUpdateAction, exportToBlob, exportToSvg,
} from "@easydraw/canvas-engine";
import type { EasyDrawImperativeAPI } from "@easydraw/canvas-engine";
import { NativeElementSchema } from "@easydraw/document-model";

const elements = restoreElements([
  { id: "pilot-page", type: "frame", x: 100, y: 100, width: 640, height: 480, name: "验证页面",
    backgroundColor: "#ffffff", roundness: { type: 3, value: 12 } },
  { id: "pilot-rectangle", type: "rectangle", x: 160, y: 240, width: 160, height: 90,
    backgroundColor: "#dbeafe", strokeColor: "#2563eb", fillStyle: "solid", roughness: 0, frameId: "pilot-page" },
  { id: "pilot-text", type: "text", x: 160, y: 160, width: 280, height: 30,
    text: "EasyDraw 源码引擎", originalText: "EasyDraw 源码引擎", fontSize: 24, fontFamily: 6,
    lineHeight: 1.25, textAlign: "left", verticalAlign: "top", frameId: "pilot-page" },
  { id: "pilot-vector", type: "rectangle", x: 400, y: 240, width: 96, height: 96,
    backgroundColor: "transparent", strokeColor: "#dc2626", strokeWidth: 0, roughness: 0,
    frameId: "pilot-page", vectorData: {
      viewBox: [0, 0, 24, 24], content: '<path d="M12 2 L22 22 L2 22 Z"/>',
      paths: [{ d: "M12 2 L22 22 L2 22 Z", transform: [1, 0, 0, 1, 0, 0],
        fill: "currentColor", stroke: "none", strokeWidth: 0, lineCap: "round", lineJoin: "round",
        miterLimit: 4, fillRule: "nonzero", opacity: 1, fillOpacity: 1, strokeOpacity: 1 }],
    } },
], null);

let api: EasyDrawImperativeAPI;
function Pilot() {
  const [mode, setMode] = useState({ viewer: false, generation: 0 });
  const saved = localStorage.getItem("easydraw-engine-pilot");
  const initialElements = saved
    ? JSON.parse(saved).map((element: unknown) => NativeElementSchema.parse(element))
    : elements;
  Object.assign(window, { pilot: {
    get api() { return api; },
    save() {
      const snapshot = JSON.stringify(api.getSceneElements().map((element) => NativeElementSchema.parse(element)));
      localStorage.setItem("easydraw-engine-pilot", snapshot);
      return snapshot;
    },
    reload(viewer = false) {
      setMode((previous) => ({ viewer, generation: previous.generation + 1 }));
    },
    changeColor(id: string, color: string) {
      api.updateScene({
        elements: api.getSceneElements().map((element) => element.id === id
          ? newElementWith(element, { strokeColor: color }) : element),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
    },
    async exportSvg() {
      return (await exportToSvg({ elements: api.getSceneElements(), files: api.getFiles(),
        appState: api.getAppState(), skipInliningFonts: true })).outerHTML;
    },
    async exportVector(source: string, color: string) {
      const vectorData = parseSvgVector(source);
      if (!vectorData) throw new Error("Invalid SVG fixture");
      const vector = restoreElements([{ id: "export-vector", type: "rectangle", x: 0, y: 0,
        width: 32, height: 16, strokeColor: color, vectorData }], null);
      return (await exportToSvg({ elements: vector, files: {}, skipInliningFonts: true })).outerHTML;
    },
    async exportPage() {
      const frame = api.getSceneElements().find(element => element.type === "frame")!;
      const outside = restoreElements([{ id: "outside-export", type: "rectangle", x: 900, y: 900,
        width: 100, height: 100 }], null);
      const blob = await exportToBlob({ elements: [...api.getSceneElements(), ...outside], files: api.getFiles(),
        exportingFrame: frame, exportPadding: 0, getDimensions: () => ({ width: frame.width * 2, height: frame.height * 2, scale: 2 }),
        appState: api.getAppState(), mimeType: "image/png" });
      const bitmap = await createImageBitmap(blob);
      const result = { size: blob.size, type: blob.type, width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return result;
    },
  } });
  return <div style={{ height: "100vh" }}>
    <EasyDrawCanvas
      key={mode.generation}
      initialData={{ elements: initialElements, appState: { viewBackgroundColor: "#f1f5f9" } }}
      canvasAPI={(instance) => { api = instance; Object.assign(window, { pilotAPI: instance }); }}
      viewModeEnabled={mode.viewer}
      aiEnabled={false}
      langCode="zh-CN"
    />
  </div>;
}

createRoot(document.getElementById("root")!).render(<Pilot />);
