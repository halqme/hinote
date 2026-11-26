// Bundled into the page once by <Chart>. It animates every chart on the page
// from the scenes the server put next to it.
import type { HinoteClient } from "@hinote/types";
import { motion } from "@tanstack/charts/motion";
import { revive } from "./scene.ts";

// The page defines it before any script it bundles runs.
declare const hinote: HinoteClient;

type Surface = ReturnType<ReturnType<typeof motion>["mount"]>;

// A chart grows in when its slide is shown and moves to the next scene at
// each of its steps. When the slide is left it goes back to the SVG the
// server drew, so it grows in again next time and prints whole.
function animate(figure: HTMLElement): void {
  const data = figure.querySelector("script[type='application/json']");
  const scenes = revive(data?.textContent ?? "[]");
  const svg = figure.querySelector("svg");
  if (scenes.length === 0 || !svg) return;
  const options = {
    ariaLabel: svg.getAttribute("aria-label") ?? "",
    ariaDescription: svg.getAttribute("aria-description") ?? undefined,
    idPrefix: figure.dataset.hinoteChart,
  };
  let surface: Surface | undefined;
  let host: HTMLElement | undefined;

  hinote.observe(figure, ({ active, step }) => {
    if (!active) {
      surface?.destroy?.();
      surface = undefined;
      host?.replaceWith(svg);
      host = undefined;
      return;
    }
    if (!surface) {
      // A fresh surface plays the entrance.
      host = document.createElement("div");
      host.style.cssText = "width:100%;height:100%";
      svg.replaceWith(host);
      surface = motion().mount(host, () => {});
    }
    const scene = scenes[step] ?? scenes.at(-1);
    if (scene) surface.render(scene, options);
  });
}

// Every chart of each slide as the slide enters the page.
hinote.mount("[data-hinote-chart]", animate);
