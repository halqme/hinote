// Relays sync messages between the pages connected to one server. Pages listen on
// an SSE stream and send with POST, so this needs nothing beyond Hono itself.
// The hub lives in memory: on a runtime that spreads requests over several
// isolates, only pages that reach the same isolate see each other.

export type HubClient = (message: unknown) => void;

export class SyncHub {
  readonly #clients = new Map<string, HubClient>();

  connect(id: string, client: HubClient): () => void {
    this.#clients.set(id, client);
    return () => {
      if (this.#clients.get(id) === client) this.#clients.delete(id);
    };
  }

  // Sends to every page except `from`, which already shows the change.
  broadcast(message: unknown, from?: string): void {
    for (const [id, client] of this.#clients) {
      if (id !== from) client(message);
    }
  }
}
