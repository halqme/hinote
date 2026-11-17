// Reads the roast log while the slide renders. import.meta.url is this file,
// under `hinote dev`, `hinote build`, and `bun deck.tsx` alike.
type Batch = { no: number; mode: "manual" | "auto"; firstCrack: number };
type Log = { target: number; batches: Batch[] };

function spread(values: number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.round(Math.sqrt(variance));
}

export async function FirstCrackChart() {
  const log: Log = await Bun.file(
    new URL("../data/roasts.json", import.meta.url),
  ).json();
  const max = Math.max(...log.batches.map((batch) => batch.firstCrack));
  const of = (mode: Batch["mode"]) =>
    log.batches.filter((batch) => batch.mode === mode).map((b) => b.firstCrack);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "1rem",
          height: "420px",
          borderBottom: "2px solid var(--hinote-color-muted)",
        }}
      >
        {log.batches.map((batch) => (
          <div
            title={`#${batch.no}: ${batch.firstCrack}s`}
            style={{
              flex: "1",
              height: `${(batch.firstCrack / max) * 100}%`,
              borderRadius: "8px 8px 0 0",
              background:
                batch.mode === "auto"
                  ? "var(--hinote-color-accent)"
                  : "var(--hinote-color-muted)",
            }}
          />
        ))}
      </div>
      <p>
        1ハゼまでの時間のばらつき（標準偏差）: 手動{" "}
        <b>{spread(of("manual"))}秒</b> → 自動{" "}
        <b style={{ color: "var(--hinote-color-accent)" }}>
          {spread(of("auto"))}秒
        </b>
        <small>（目標 {log.target} 秒）</small>
      </p>
    </div>
  );
}
