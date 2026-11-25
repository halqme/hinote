// Keeps tsconfig.client.json from matching nothing, and guards the
// @hinote/core/client global types used by browser files.
import type { Position, Role } from "@hinote/core/client";

const role: Role = hinote.role;
hinote.on("position", (position: Position) => position.slide);

export { role };
