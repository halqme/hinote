import { Center, createSlide, type Theme } from "hinote";
import points from "./slides/points.tsx";

export const theme: Theme = {
  colors: { bg: "#0f1115", fg: "#f8fafc", accent: "#38bdf8", muted: "#94a3b8" },
  fonts: {
    base: "system-ui, sans-serif",
    heading: "system-ui, sans-serif",
    mono: "ui-monospace, monospace",
  },
  typography: {
    h1: "4.5rem",
    h2: "2.25rem",
    body: "1.35rem",
    small: "0.95rem",
  },
  shadows: { md: "0 12px 40px rgb(0 0 0 / 0.35)" },
  spacing: { unit: "8px" },
  radius: "12px",
};

const title = createSlide({ title: "hinote", notes: "はじめる" }, () => (
  <Center>
    <h1>hinote</h1>
    <p>Hono/JSX で書くスライド</p>
  </Center>
));

const nested = createSlide([
  createSlide({ title: "Theme", theme: { colors: { bg: "#111827" } } }, () => (
    <Center>
      <h2>スライドごとのテーマ</h2>
    </Center>
  )),
]);

export default createSlide([title, points, nested]);
