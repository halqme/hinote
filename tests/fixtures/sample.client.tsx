// Keeps tsconfig.client.json from matching nothing, and guards the
// hinote/client global types used by browser files.
// oxlint-disable-next-line typescript/triple-slash-reference -- types the browser global without importing it into a slide
/// <reference types="hinote/client" />
import type { Position, Role } from "hinote/client";

const role: Role = hinote.role;
hinote.on("position", (position: Position) => position.slide);

export { role };
