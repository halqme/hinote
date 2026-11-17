import { Center, createSlide } from "hinote";

// This slide alone swaps the palette, and enters with a slide instead of a fade.
export default createSlide(
  {
    title: "おわり",
    notes: "質問を受ける。",
    transition: "slide",
    theme: { colors: { bg: "#e0a96d", fg: "#1c1410", muted: "#3b2418" } },
    // CSS for this slide only. It wins over style.css.
    css: "h1 { letter-spacing: -0.02em; }",
  },
  () => (
    <Center gap={2}>
      <h1>ありがとうございました</h1>
      <small>スライドは hinote で書きました</small>
    </Center>
  ),
);
