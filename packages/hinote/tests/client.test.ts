import { expect, test } from "bun:test";
import { buildClientSource } from "../scripts/build-client.ts";

test("main.generated.ts matches src/client/main.ts (run `bun run build:client`)", async () => {
  const generated = await Bun.file(
    new URL("../src/client/main.generated.ts", import.meta.url),
  ).text();
  expect(generated).toBe(await buildClientSource());
});
