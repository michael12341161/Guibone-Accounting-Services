import React from "react";
import { createRoot } from "react-dom/client";
import "./assets/styles/index.css";
import App from "./app";

const container = document.getElementById("root");
if (!container) {
  throw new Error('Root element with id "root" not found in public/index.html');
}

const root = createRoot(container);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
