// Runs in the browser, bundled by hinote from <Script> in slides/results.tsx.
// The presenter picks which roasts to show; every page follows through
// hinote.send, and a reload starts again from all of them.
import { render, useState } from "hono/jsx/dom";

type Mode = "all" | "manual" | "auto";

const LABELS: Record<Mode, string> = {
  all: "すべて",
  manual: "手動",
  auto: "自動",
};

function show(mode: Mode) {
  // The presenter's previews copy the slide, so they follow along too.
  for (const bar of document.querySelectorAll<HTMLElement>("[data-roast]")) {
    const on = mode === "all" || bar.dataset.roast === mode;
    bar.style.opacity = on ? "1" : "0.15";
  }
}

hinote.on("chart:mode", (mode) => show(mode as Mode));

function Controls() {
  const [mode, setMode] = useState<Mode>("all");
  return (
    <div class="chart-controls">
      {(Object.keys(LABELS) as Mode[]).map((next) => (
        <button
          type="button"
          aria-pressed={next === mode ? "true" : "false"}
          onClick={() => {
            setMode(next);
            hinote.send("chart:mode", next);
          }}
        >
          {LABELS[next]}
        </button>
      ))}
    </div>
  );
}

// Only the presenter gets the buttons; #deck leaves out the previews.
if (hinote.role === "presenter") {
  for (const slot of document.querySelectorAll<HTMLElement>(
    "#deck .chart-slot",
  ))
    render(<Controls />, slot);
}
