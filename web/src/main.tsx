import "./styles/index.scss";
import { render } from "preact";

import "../external/lang/Languages.patch";
import { App } from "./pages/app";
import "./updateWorker";

// Auto-recover gracefully from stale asset chunk / CSS preloads on deployment
window.addEventListener("vite:preloadError", (event) => {
    console.warn("Vite preload error detected, reloading page...", event);
    window.location.reload();
});

// Prevent accidental browser/desktop zooming via Ctrl+wheel or Ctrl +/-
if (typeof window !== "undefined") {
    window.addEventListener(
        "wheel",
        (e) => {
            if (e.ctrlKey) {
                e.preventDefault();
            }
        },
        { passive: false }
    );

    window.addEventListener(
        "keydown",
        (e) => {
            if (
                (e.ctrlKey || e.metaKey) &&
                (e.key === "=" ||
                    e.key === "+" ||
                    e.key === "-" ||
                    e.key === "_" ||
                    e.code === "NumpadAdd" ||
                    e.code === "NumpadSubtract")
            ) {
                e.preventDefault();
            }
        },
        { capture: true }
    );

    window.addEventListener(
        "dragstart",
        (e) => {
            const target = e.target as HTMLElement | null;
            if (
                target &&
                (target.tagName === "A" ||
                    target.tagName === "IMG" ||
                    target.closest("a") ||
                    target.closest("button"))
            ) {
                e.preventDefault();
            }
        },
        { capture: true }
    );
}

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
render(<App />, document.getElementById("app")!);
