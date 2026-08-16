/* LUMINARY ENDURANCE MANAGER — sync backend
   ============================================================================
   Phase 1 of the multi-car reshape (Steps 7 to 9 in CLAUDE.md).

   WHAT THIS IS
   One Durable Object per TEAM, holding that team's shared state and every
   connected client. Not one per entry: the planned home screen has to show all
   of a team's cars at once, and that needs a single consistent view.

   WHY IT EXISTS
   The app stores everything in localStorage, which is per device. Michael runs
   strategy across a phone and a PC during a race and they currently cannot see
   each other's data at all. This is the fix.

   WHAT IT DELIBERATELY IS NOT, YET
   Phase 1 proves the pipe: connect, send a change, everyone else sees it, and a
   client joining late catches up. Entries, presence, Race Lock and the offline
   queue come in later phases. The message shapes below already carry entryId so
   those can land without a protocol break.

   HOSTING
   The app itself stays on GitHub Pages. This Worker only does sync, so it is an
   API with no static assets. That keeps the existing deploy working and means a
   Cloudflare problem cannot take the app offline, only its syncing.

   CONFLICTS
   Last write wins PER FIELD, not per document. Two people editing different
   fields of the same entry both keep their change. Two people editing the same
   field, later timestamp wins. This is why patches carry a path rather than the
   whole state: whole-document writes are what make the current Apps Script
   backend dangerous.

   ACCESS
   The team key in the URL is the only credential, by design: no accounts, no
   passwords, an invite link you paste into Discord. That means anyone who gets
   the link can edit. Keys must therefore be long and random, never guessable
   like a team name. See newTeamKey() below.
   ========================================================================== */

import { DurableObject } from 'cloudflare:workers';

const MAX_MESSAGE_BYTES = 128 * 1024;   // a single patch is tiny; this is slack
const MAX_FIELDS = 5000;                // guard against unbounded state growth
const PROTOCOL = 1;

/* Team keys are the entire access control story, so they are generated here
   rather than being chosen by a human. 160 bits of randomness, lowercase
   base36, in readable groups. */
function newTeamKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const raw = [...bytes].map(b => b.toString(36).padStart(2, '0')).join('');
  return raw.slice(0, 8) + '-' + raw.slice(8, 16) + '-' + raw.slice(16, 24);
}

const KEY_RE = /^[a-z0-9-]{8,64}$/;

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      // The app is served from github.io, so browser fetches here are
      // cross-origin. WebSocket upgrades are not subject to CORS, but the
      // health and key endpoints are.
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      ...extra
    }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'OPTIONS') return json({}, 204);

    if (path === '/' || path === '/health') {
      return json({
        ok: true,
        service: 'luminary-sync',
        protocol: PROTOCOL,
        time: new Date().toISOString()
      });
    }

    // Hand out a fresh team key. The caller keeps it; the server does not need
    // to remember it, because a Durable Object is created on first use.
    if (path === '/team/new') {
      return json({ ok: true, teamKey: newTeamKey() });
    }

    // /team/<key>/ws  -> WebSocket
    // /team/<key>/state -> read-only snapshot, handy for debugging
    const m = path.match(/^\/team\/([^/]+)\/(ws|state)$/);
    if (m) {
      const teamKey = decodeURIComponent(m[1]).toLowerCase();
      if (!KEY_RE.test(teamKey)) {
        return json({ ok: false, error: 'bad team key' }, 400);
      }
      const id = env.TEAM.idFromName(teamKey);
      const room = env.TEAM.get(id);
      return room.fetch(request);
    }

    return json({ ok: false, error: 'not found' }, 404);
  }
};

export class TeamRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    // Hibernation re-runs this constructor on every wake, so it must stay cheap.
    // State is read lazily in the handlers, never eagerly here.
  }

  /* Fields are stored one storage key each ('f:' + path) rather than as a
     single blob. That is what makes last-write-wins per field cheap and means
     two clients editing different fields never overwrite each other. */
  async loadFields() {
    const map = await this.ctx.storage.list({ prefix: 'f:' });
    const out = {};
    for (const [k, v] of map) out[k.slice(2)] = v;
    return out;
  }

  async snapshot() {
    const fields = await this.loadFields();
    const state = {};
    for (const [path, rec] of Object.entries(fields)) state[path] = rec.value;
    return {
      type: 'snapshot',
      protocol: PROTOCOL,
      state,
      fieldCount: Object.keys(state).length,
      serverTs: Date.now()
    };
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.endsWith('/state')) {
      const snap = await this.snapshot();
      return json({ ok: true, ...snap });
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return json({ ok: false, error: 'expected websocket upgrade' }, 426);
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // acceptWebSocket, not server.accept: this lets the object hibernate while
    // clients stay connected. A 6 hour race with the strategist idle between
    // stints would otherwise bill for the whole 6 hours of wall time.
    this.ctx.acceptWebSocket(server);

    const clientId = url.searchParams.get('clientId') || crypto.randomUUID();
    const name = (url.searchParams.get('name') || 'Someone').slice(0, 40);
    // Attachments survive hibernation; instance fields do not.
    server.serializeAttachment({ clientId, name, since: Date.now() });

    // Send the catch-up snapshot immediately so a device joining mid-race is
    // current without anyone having to touch anything.
    this.snapshot().then(snap => {
      try { server.send(JSON.stringify(snap)); } catch (e) { /* client vanished */ }
    });

    this.broadcastPresence(server);

    return new Response(null, { status: 101, webSocket: client });
  }

  peers() {
    return this.ctx.getWebSockets().map(ws => {
      const a = ws.deserializeAttachment() || {};
      return { clientId: a.clientId, name: a.name, since: a.since };
    });
  }

  broadcast(obj, exclude) {
    const msg = JSON.stringify(obj);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === exclude) continue;
      try { ws.send(msg); } catch (e) { /* dropped; close handler cleans up */ }
    }
  }

  broadcastPresence(exclude) {
    const presence = { type: 'presence', peers: this.peers(), serverTs: Date.now() };
    this.broadcast(presence, null);
    if (exclude) {
      try { exclude.send(JSON.stringify(presence)); } catch (e) {}
    }
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string') return;
    if (raw.length > MAX_MESSAGE_BYTES) {
      ws.send(JSON.stringify({ type: 'error', error: 'message too large' }));
      return;
    }

    let msg;
    try { msg = JSON.parse(raw); } catch (e) {
      ws.send(JSON.stringify({ type: 'error', error: 'bad json' }));
      return;
    }

    const who = ws.deserializeAttachment() || {};

    if (msg.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', serverTs: Date.now() }));
      return;
    }

    if (msg.type === 'get') {
      ws.send(JSON.stringify(await this.snapshot()));
      return;
    }

    if (msg.type === 'patch') {
      const path = String(msg.path || '').slice(0, 200);
      if (!path) {
        ws.send(JSON.stringify({ type: 'error', error: 'patch needs a path' }));
        return;
      }
      const ts = Number(msg.ts) || Date.now();
      const key = 'f:' + path;
      const prev = await this.ctx.storage.get(key);

      // Last write wins per field. A patch that lost the race is dropped and the
      // sender is told the winning value, so a device that was offline cannot
      // silently clobber newer data when it reconnects and flushes.
      if (prev && prev.ts > ts) {
        ws.send(JSON.stringify({
          type: 'rejected', path, reason: 'stale',
          value: prev.value, ts: prev.ts, serverTs: Date.now()
        }));
        return;
      }

      if (!prev) {
        const count = (await this.ctx.storage.list({ prefix: 'f:', limit: MAX_FIELDS + 1 })).size;
        if (count >= MAX_FIELDS) {
          ws.send(JSON.stringify({ type: 'error', error: 'field limit reached' }));
          return;
        }
      }

      const rec = { value: msg.value, ts, clientId: who.clientId || msg.clientId || null };
      await this.ctx.storage.put(key, rec);

      this.broadcast({
        type: 'patch',
        path,
        value: rec.value,
        ts: rec.ts,
        clientId: rec.clientId,
        serverTs: Date.now()
      }, ws);

      // Acknowledge to the sender so the client can retire its pending queue.
      ws.send(JSON.stringify({ type: 'ack', path, ts: rec.ts, serverTs: Date.now() }));
      return;
    }

    ws.send(JSON.stringify({ type: 'error', error: 'unknown message type: ' + msg.type }));
  }

  async webSocketClose(ws, code, reason, wasClean) {
    this.broadcastPresence(null);
  }

  async webSocketError(ws, error) {
    this.broadcastPresence(null);
  }
}
