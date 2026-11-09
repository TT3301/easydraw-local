import React from "react";
import ReactDOM from "react-dom/client";
import { ShareViewer } from "./ShareViewer";
import "./viewer.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ShareViewer />
  </React.StrictMode>,
);
