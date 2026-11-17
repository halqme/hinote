import { Column, Row, createSlide } from "hinote";
import { Card } from "../components/Card.tsx";

export default createSlide(
  { title: "課題", notes: "左を見せてから、右を同時に2つ出す。" },
  () => (
    <Column gap={4}>
      <h2>手で焼くと、毎回ちがう</h2>
      <Row gap={4}>
        <Card title="いま">
          <p>コンロの火を見ながら、つまみを回す。</p>
          <p>1ハゼの時間が 470〜600 秒でばらつく。</p>
        </Card>
        <Card title="ほしい" accent step={1}>
          <p>豆の温度で火力を決める。</p>
        </Card>
        <Card title="条件" accent step={1}>
          <p>予算 1 万円、週末 2 回で作る。</p>
        </Card>
      </Row>
    </Column>
  ),
);
