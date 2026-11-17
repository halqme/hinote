import { Column, createSlide } from "hinote";
import { FirstCrackChart } from "../components/FirstCrackChart.tsx";

export default createSlide(
  {
    title: "結果",
    notes: "灰色が手動、色付きが自動。数字は data/roasts.json から計算。",
  },
  () => (
    <Column gap={4}>
      <h2>12回焼いてみた</h2>
      <FirstCrackChart />
    </Column>
  ),
);
