import { Center, createSlide } from "hinote";

export default createSlide(
  {
    title: "週末の焙煎をコードで回す",
    notes:
      "自己紹介は短く。今日は「手で焼くと毎回味が違う」をどう直したかの話。",
  },
  () => (
    <Center gap={3}>
      <small>Weekend Hack LT #12</small>
      <h1>
        週末の焙煎を
        <br />
        コードで回す
      </h1>
      <p style={{ color: "var(--hinote-color-muted)" }}>@roastbyte</p>
    </Center>
  ),
);
