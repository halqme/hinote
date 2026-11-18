// Relays sync messages between the pages connected to one process. Pages listen
// on an SSE stream and send with POST, so this needs nothing beyond Hono itself.
//
// There is one hub per process, kept on globalThis, so it outlives the deck
// module: `bun --hot` and `hinote dev` evaluate the deck again on every edit,
// and pages connected to the old deck must still hear that they should reload.
// Pages join the channel of the path the deck is mounted at, so two decks in one
// app do not follow each other.
//
// The hub lives in memory: on a runtime that spreads requests over several
// isolates, only pages that reach the same isolate see each other.

export type HubClient = (message: unknown) => void;

export type SyncHub = {
  connect(channel: string, id: string, client: HubClient): () => void;
  // Sends to every page on the channel except `from`, which already shows the change.
  broadcast(channel: string, message: unknown, from?: string): void;
  // Tells every connected page to reload. Calls within a short time send once.
  reloadAll(): void;
};

const RELOAD_DELAY_MS = 50;

function createHub(): SyncHub {
  const channels = new Map<string, Map<string, HubClient>>();
  let reload: ReturnType<typeof setTimeout> | undefined;
  return {
    connect(channel, id, client) {
      let clients = channels.get(channel);
      if (!clients) channels.set(channel, (clients = new Map()));
      clients.set(id, client);
      return () => {
        if (clients.get(id) === client) clients.delete(id);
        if (clients.size === 0 && channels.get(channel) === clients)
          channels.delete(channel);
      };
    },
    broadcast(channel, message, from) {
      for (const [id, client] of channels.get(channel) ?? []) {
        if (id !== from) client(message);
      }
    },
    reloadAll() {
      if (channels.size === 0 || reload) return;
      // Wait until the new deck is in place before pages ask for it again.
      reload = setTimeout(() => {
        reload = undefined;
        for (const clients of channels.values()) {
          for (const client of clients.values()) client({ type: "reload" });
        }
      }, RELOAD_DELAY_MS);
    },
  };
}

const KEY = Symbol.for("hinote.syncHub");

export function syncHub(): SyncHub {
  // Only this function reads or writes the key.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const global = globalThis as { [KEY]?: SyncHub };
  return (global[KEY] ??= createHub());
}
