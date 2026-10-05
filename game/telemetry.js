// Anonymous gameplay telemetry.
//
// * Player id: a random UUID in localStorage. No names, emails, IPs or device ids are sent.
// * Experiment arm: hash(player id + experiment id), stable for a player across sessions.
// * Events are queued and sent in batches; the queue is flushed when the tab is hidden or
//   closed (fetch keepalive), and kept in localStorage if the network is down.
// * Opt-out: one toggle on the title screen; nothing is sent afterwards.
"use strict";

const Telemetry = (() => {
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  };

  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // FNV-1a, then MurmurHash3's fmix32 finalizer. Without the finalizer, FNV's low bit is
  // just the XOR of the input characters' low bits, so "hash % 2" would assign arms by
  // character parity (and a new experiment id would flip every player instead of
  // reshuffling them). The JS tests check both properties.
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return h >>> 0;
  }

  function assign(playerId, experimentId, variants) {
    return variants[hash(playerId + ":" + experimentId) % variants.length];
  }

  const state = {
    playerId: null, sessionId: null, variant: null, seq: 0, queue: [],
    isBot: false, clock: () => Date.now(), endpoint: null, headers: {},
    optedOut: false, sent: 0, failed: 0, timer: null,
  };

  function init({ bot = null, collector = null } = {}) {
    state.sessionId = uuid();
    state.seq = 0;
    if (bot) {
      state.isBot = true;
      state.playerId = bot.playerId;
      state.clock = bot.clock;
      state.optedOut = false;
    } else {
      state.playerId = LS.get("si_player") || uuid();
      LS.set("si_player", state.playerId);
      state.optedOut = LS.get("si_optout") === "1";
    }
    state.variant = assign(state.playerId, CONFIG.EXPERIMENT_ID, CONFIG.VARIANTS);

    if (collector) {
      state.endpoint = collector.replace(/\/$/, "") + "/events";
      state.headers = { "Content-Type": "application/json" };
    } else if (CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY) {
      state.endpoint = CONFIG.SUPABASE_URL.replace(/\/$/, "") + "/rest/v1/events";
      state.headers = {
        "Content-Type": "application/json",
        apikey: CONFIG.SUPABASE_ANON_KEY,
        Prefer: "return=minimal",
      };
      // legacy anon keys are JWTs and also go in Authorization; new "sb_publishable_" keys
      // must only be sent as apikey
      if (!CONFIG.SUPABASE_ANON_KEY.startsWith("sb_")) {
        state.headers.Authorization = "Bearer " + CONFIG.SUPABASE_ANON_KEY;
      }
    }
    if (!state.isBot) {
      // events that didn't make it out last time
      try {
        const saved = JSON.parse(LS.get("si_unsent") || "[]");
        if (Array.isArray(saved)) state.queue.push(...saved.slice(-500));
      } catch { /* ignore */ }
      LS.set("si_unsent", "[]");
      state.timer = setInterval(() => flush(), 5000);
      const bye = () => { flush(true); };
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") bye();
      });
      window.addEventListener("pagehide", bye);
    }
    return state.variant;
  }

  function track(event, props = {}) {
    if (state.optedOut) return;
    state.queue.push({
      event_id: uuid(),
      player_id: state.playerId,
      session_id: state.sessionId,
      event,
      seq: state.seq++,
      client_ts: new Date(state.clock()).toISOString(),
      experiment_id: CONFIG.EXPERIMENT_ID,
      variant: state.variant,
      game_version: CONFIG.GAME_VERSION,
      is_bot: state.isBot,
      props,
    });
    if (state.queue.length >= 25) flush();
  }

  async function flush(leaving = false) {
    if (!state.queue.length) return;
    const batch = state.queue.splice(0, state.queue.length);
    if (!state.endpoint) {  // no backend configured: keep a local copy for debugging
      const kept = JSON.parse(LS.get("si_local_events") || "[]").concat(batch).slice(-300);
      LS.set("si_local_events", JSON.stringify(kept));
      return;
    }
    try {
      const r = await fetch(state.endpoint, {
        method: "POST", headers: state.headers, body: JSON.stringify(batch),
        keepalive: leaving,
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      state.sent += batch.length;
    } catch (e) {
      state.failed += batch.length;
      if (!state.isBot) {
        const kept = JSON.parse(LS.get("si_unsent") || "[]").concat(batch).slice(-500);
        LS.set("si_unsent", JSON.stringify(kept));
      }
    }
  }

  function setOptOut(v) {
    state.optedOut = v;
    LS.set("si_optout", v ? "1" : "0");
    if (v) state.queue.length = 0;
  }

  return {
    init, track, flush, setOptOut, hash, assign,
    get variant() { return state.variant; },
    get optedOut() { return state.optedOut; },
    get playerId() { return state.playerId; },
    get stats() { return { sent: state.sent, failed: state.failed, queued: state.queue.length }; },
    LS,
  };
})();
