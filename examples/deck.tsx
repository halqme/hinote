import { Center, Code, Column, Step, createSlide } from "hinote";
import points from "./slides/points.tsx";

const title = createSlide({ title: "hinote", notes: "はじめる" }, () => (
  <Center>
    <h1>hinote</h1>
    <p>Hono/JSX で書くスライド</p>
  </Center>
));

const steps = createSlide({ title: "Step", notes: "一つずつ出す" }, () => (
  <Center gap={2}>
    <h2>一歩ずつ見せる</h2>
    <ul>
      <Step as="li">右矢印で一つ目</Step>
      <Step as="li">もう一度で二つ目</Step>
      <Step as="li">最後に次のスライドへ</Step>
    </ul>
  </Center>
));

const code = createSlide({ title: "Code", notes: "色はビルド時に付く" }, () => (
  <Column gap={3}>
    <h2>コードを書く</h2>
    <Code lang="tsx">{`
      export default createSlide([
        createSlide(() => <h1>hinote</h1>),
      ]);
    `}</Code>
  </Column>
));

const nested = createSlide({ theme: { colors: { bg: "#111827" } } }, [
  createSlide({ title: "Theme" }, () => (
    <Center>
      <h2>入れ子のデッキのテーマ</h2>
    </Center>
  )),
]);

// The deck is a Hono app: `bun examples/deck.tsx` serves it as is.
export default createSlide(
  {
    aspect: "16:9",
    transition: "slide",
    theme: {
      colors: {
        bg: "#0f1115",
        fg: "#f8fafc",
        accent: "#38bdf8",
        muted: "#94a3b8",
      },
      typography: { h1: "7rem", h2: "4rem", body: "2.25rem", small: "1.5rem" },
      shadows: { md: "0 12px 40px rgb(0 0 0 / 0.35)" },
      radius: "12px",
    },
  },
  [title, points, steps, code, nested],
);
