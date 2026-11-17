import { Code, Column, createSlide } from "hinote";

export default createSlide(
  {
    title: "制御",
    notes: "PID と言うほどでもない。差に比例して火力を決めるだけ。",
  },
  () => (
    <Column gap={3}>
      <h2>火力の決め方</h2>
      <Code lang="ts">{`
        // 1 秒ごとに、目標の温度曲線との差から火力を決める
        export function nextPower(now: Reading, profile: Profile): number {
          const target = profile.at(now.elapsed);
          const error = target - now.beanTemp;
          const power = profile.base + error * 0.8;
          return Math.min(100, Math.max(0, power));
        }
      `}</Code>
    </Column>
  ),
);
