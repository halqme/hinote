import { Column, Row, Script, createSlide } from "hinote";
import { FirstCrackChart } from "../components/FirstCrackChart.tsx";

export default createSlide(
  {
    title: "結果",
    notes:
      "灰色が手動、色付きが自動。数字は data/roasts.json から計算。右上のボタンで手動・自動を切り替えると、視聴画面も追従する。",
  },
  () => (
    <Column gap={4}>
      <Row justify="space-between" align="center">
        <h2>12回焼いてみた</h2>
        <div class="chart-slot" />
      </Row>
      <FirstCrackChart />
      <Script
        src={new URL("../components/results.client.tsx", import.meta.url)}
      />
    </Column>
  ),
);
