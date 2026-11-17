import { expect, test } from "bun:test";
import { buildClientSource } from "../scripts/build-client.ts";

test("client.generated.ts matches src/client.ts (run `bun run build:client`)", async () => {
  const generated = await Bun.file(
    new URL("../src/client.generated.ts", import.meta.url),
  ).text();
  expect(generated).toBe(await buildClientSource());
});
