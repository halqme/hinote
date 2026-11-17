import { Column, Row, Script, createSlide } from "hinote";

// A slide whose content runs in the browser: see components/life.client.tsx.
export default createSlide(
  {
    title: "おまけ: ライフゲーム",
    notes:
      "発表者画面のボタンで再生・1世代・ランダム。盤面をクリックすると細胞を反転できる。視聴画面は発表者画面の盤面を受け取って描く。",
  },
  () => (
    <Column gap={3}>
      <Row justify="space-between" align="center">
        <h2>おまけ: ライフゲーム</h2>
        <div class="life-slot" />
      </Row>
      <canvas class="life-board" width="1600" height="800" />
      <small class="life-generation">第 0 世代</small>
      <Script src={new URL("../components/life.client.tsx", import.meta.url)} />
    </Column>
  ),
);
