import { Column, Row, createSlide } from "hinote";

export default createSlide({ title: "Layout", notes: "左右を見せる" }, () => (
  <Column gap={3}>
    <h2>Column と Row</h2>
    <Row gap={2} justify="space-between">
      <p>左</p>
      <p>右</p>
    </Row>
  </Column>
));
