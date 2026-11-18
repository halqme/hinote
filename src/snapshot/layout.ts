// Measures one open slide in the browser: canvas overflow, clipped content,
// and safe-area crossings. Runs as a page expression through CapturePage.evaluate
// so every browser backend can return the same plain JSON.
import { isPlainObject } from "../guards.ts";
import type { CapturePage } from "./browser.ts";

export type LayoutCode = "overflow" | "clipped" | "safe-area";

export type LayoutIssue = {
  code: LayoutCode;
  message: string;
  slides: number[];
  hint: string;
  selector?: string;
  text?: string;
};

export type LayoutReport = {
  problems: LayoutIssue[];
  warnings: LayoutIssue[];
};

const SLOP = 1;

// Shows every step on the active slide with no fade, so the PNG and the layout
// report both see the finished slide (same idea as print).
export function revealAllExpression(index: number): string {
  return `(() => {
    const slide = document.querySelectorAll("#deck .slide")[${index}];
    if (!slide) return false;
    const steps = slide.querySelectorAll("[data-hinote-step]");
    for (const el of steps) {
      // Kill the 0.2s opacity transition before unhiding, or the shot can land
      // mid-fade with steps half-transparent.
      el.style.transition = "none";
      el.classList.remove("is-hidden");
    }
    void slide.offsetHeight;
    for (const el of steps) {
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || Number(style.opacity) < 1)
        return false;
    }
    return true;
  })()`;
}

export async function measureSlide(
  page: CapturePage,
  index: number,
): Promise<LayoutReport> {
  // The report comes from measureExpression below, so only its lists are checked.
  const report = await page.evaluate(measureExpression(index));
  const list = (value: unknown): LayoutIssue[] =>
    Array.isArray(value) ? value : [];
  return isPlainObject(report)
    ? { problems: list(report.problems), warnings: list(report.warnings) }
    : { problems: [], warnings: [] };
}

// Built as a string so agent-browser, puppeteer, and CDP each run the same code.
function measureExpression(index: number): string {
  return `(() => {
    const SLOP = ${SLOP};
    const slideIndex = ${index};
    const slide = document.querySelectorAll("#deck .slide")[slideIndex];
    if (!slide) return { problems: [], warnings: [] };
    const slideBox = slide.getBoundingClientRect();
    const safe = resolveSafe(slide);
    const safeBox = {
      left: slideBox.left + safe,
      top: slideBox.top + safe,
      right: slideBox.right - safe,
      bottom: slideBox.bottom - safe,
    };
    const problems = [];
    const warnings = [];
    const overflowEls = new Set();
    const safeEls = new Set();
    const number = slideIndex + 1;

    for (const el of slide.querySelectorAll("*")) {
      if (skipChrome(el)) continue;
      if (!hasBox(el)) continue;

      const clipped = clippedAxes(el);
      if (clipped && !el.classList.contains("slide")) {
        const where = clipped === "both"
          ? "width and height"
          : clipped === "x"
            ? "width"
            : "height";
        const id = identify(el);
        problems.push({
          code: "clipped",
          message: \`\${id.selector} clips its content (\${where}).\`,
          slides: [number],
          hint: "Widen or shorten the content, or set overflow to visible.",
          ...id,
        });
      }

      if (el.closest("[data-hinote-bleed]")) continue;
      if (hasMarkedAncestor(el, overflowEls)) continue;

      const over = leaveEdges(el.getBoundingClientRect(), slideBox);
      if (over) {
        overflowEls.add(el);
        const id = identify(el);
        problems.push({
          code: "overflow",
          message: \`\${id.selector} leaves the canvas on the \${over.edge} by \${over.by}px.\`,
          slides: [number],
          hint: "Move it inside the canvas, or mark intentional bleed with data-hinote-bleed.",
          ...id,
        });
        continue;
      }

      if (hasMarkedAncestor(el, safeEls)) continue;
      const cross = leaveEdges(el.getBoundingClientRect(), safeBox);
      if (cross) {
        safeEls.add(el);
        const id = identify(el);
        warnings.push({
          code: "safe-area",
          message: \`\${id.selector} crosses the safe area on the \${cross.edge} by \${cross.by}px.\`,
          slides: [number],
          hint: "Keep content inside spacing.safe from each edge, or set data-hinote-bleed. If deck CSS changes the slide padding, set the theme's spacing.safe to match it.",
          ...id,
        });
      }
    }

    return { problems, warnings };

    function resolveSafe(root) {
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:absolute;left:0;top:0;width:var(--hinote-space-safe);height:0;visibility:hidden;pointer-events:none;";
      root.appendChild(probe);
      const width = probe.getBoundingClientRect().width;
      probe.remove();
      return Number.isFinite(width) ? width : 0;
    }

    function skipChrome(el) {
      if (el.classList.contains("hinote-page")) return true;
      if (el.id === "hinote-pointer") return true;
      if (el.closest("#hinote-pointer")) return true;
      return false;
    }

    function hasBox(el) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      if (el.getClientRects().length === 0) return false;
      return true;
    }

    function hasMarkedAncestor(el, marked) {
      for (let p = el.parentElement; p && p !== slide; p = p.parentElement)
        if (marked.has(p)) return true;
      return false;
    }

    function leaveEdges(box, bound) {
      const hits = [];
      if (box.left < bound.left - SLOP)
        hits.push({ edge: "left", by: Math.round(bound.left - box.left) });
      if (box.top < bound.top - SLOP)
        hits.push({ edge: "top", by: Math.round(bound.top - box.top) });
      if (box.right > bound.right + SLOP)
        hits.push({ edge: "right", by: Math.round(box.right - bound.right) });
      if (box.bottom > bound.bottom + SLOP)
        hits.push({ edge: "bottom", by: Math.round(box.bottom - bound.bottom) });
      if (hits.length === 0) return null;
      hits.sort((a, b) => b.by - a.by);
      return hits[0];
    }

    function clippedAxes(el) {
      const style = getComputedStyle(el);
      const x =
        style.overflowX !== "visible" &&
        el.scrollWidth > el.clientWidth + SLOP;
      const y =
        style.overflowY !== "visible" &&
        el.scrollHeight > el.clientHeight + SLOP;
      if (x && y) return "both";
      if (x) return "x";
      if (y) return "y";
      return null;
    }

    function identify(el) {
      let selector = el.tagName.toLowerCase();
      if (el.id) selector += "#" + cssIdent(el.id);
      else {
        const classes = [...el.classList]
          .filter((name) => name && !name.startsWith("is-"))
          .slice(0, 2)
          .map(cssIdent);
        if (classes.length) selector += "." + classes.join(".");
      }
      const raw = (el.innerText || el.textContent || "")
        .replace(/\\s+/g, " ")
        .trim()
        .slice(0, 60);
      return raw ? { selector, text: raw } : { selector };
    }

    function cssIdent(value) {
      return CSS.escape ? CSS.escape(value) : value.replace(/[^\\w-]/g, "\\\\$&");
    }
  })()`;
}
