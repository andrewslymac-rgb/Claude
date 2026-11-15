// Orbit's stand-in for the storage, Gmail and download helpers the screens were written
// against. Same calls, but data lives in Orbit's database, Gmail goes through Orbit's
// server (which can only create drafts), and every request is permission-checked there.
(() => {
  const api = ORBIT.api + "/data";
  let data = null, loading = null, busy = 0;
  const colSubs = {}, docSubs = {};
  const split = p => { const i = p.indexOf("/"); return [p.slice(0, i), p.slice(i + 1)]; };
  const fail = (code, message) => Object.assign(new Error(message), { code });
  const snapCol = c => { const docs = Object.entries(data[c] || {}).map(([id, d]) => ({ id, data: () => d })); return { docs, size: docs.length, metadata: { fromCache: false } }; };
  const snapDoc = (c, id) => { const d = (data[c] || {})[id]; return { exists: d !== undefined, data: () => d }; };
  const emit = only => {
    for (const c in colSubs) if (!only || only === c) colSubs[c].forEach(s => s.ok(snapCol(c)));
    for (const p in docSubs) { const [c, id] = split(p); if (!only || only === c) docSubs[p].forEach(s => s.ok(snapDoc(c, id))); }
  };
  async function load() {
    const r = await fetch(api, { cache: "no-store" });
    if (!r.ok) throw fail(r.status === 403 ? "permission_denied" : "unavailable", "Orbit couldn't load this tool (" + r.status + ").");
    return r.json();
  }
  const ready = () => loading || (loading = load().then(d => { data = d; }));
  async function refresh() {
    if (busy || document.hidden || !data) return;
    try { const d = await load(); if (!busy && JSON.stringify(d) !== JSON.stringify(data)) { data = d; emit(); } } catch (e) {}
  }
  setInterval(refresh, 15000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  async function post(path, body) {
    let r;
    try { r = await fetch(ORBIT.api + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
    catch (e) { throw fail("unavailable", "Couldn't reach Orbit. Check your connection and try again."); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw fail(r.status === 403 ? "permission_denied" : "failed", j.error || "Orbit couldn't do that (" + r.status + ").");
    return j;
  }
  async function write(path, op, body) {
    const [collection, id] = split(path);
    busy++;
    try {
      await post("/data", { collection, id, op, data: body });
      data[collection] = data[collection] || {};
      if (op === "delete") delete data[collection][id];
      else if (op === "set") data[collection][id] = body;
      else data[collection][id] = { ...(data[collection][id] || {}), ...body };
      emit(collection);
    } finally { busy--; }
  }
  const sub = (map, key, ok, err, snap) => {
    const s = { ok, err }; (map[key] = map[key] || []).push(s);
    ready().then(() => ok(snap()), e => { loading = null; err && err(e); });
    return () => { map[key] = map[key].filter(x => x !== s); };
  };
  const newId = () => { const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789", b = crypto.getRandomValues(new Uint8Array(20)); return Array.from(b, x => a[x % a.length]).join(""); };
  const db = {
    collection: c => ({ onSnapshot: (ok, err) => sub(colSubs, c, ok, err, () => snapCol(c)), doc: () => ({ id: newId() }) }),
    doc: p => ({
      set: d => write(p, "set", d), update: d => write(p, "update", d), delete: () => write(p, "delete"),
      onSnapshot: (ok, err) => { const [c, id] = split(p); return sub(docSubs, p, ok, err, () => snapDoc(c, id)); },
    }),
  };
  const b64 = blob => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1]); fr.onerror = () => rej(fail("failed", "Couldn't read the file.")); fr.readAsDataURL(blob); });
  // The only Gmail action there is: create a draft. Orbit's server adds the CC and signature rules.
  const mcp = {
    listTools: async () => ({ fileArgs: true }),
    callTool: async (server, tool, input) => {
      if (server !== "Gmail" || tool !== "create_draft") throw fail("not_in_manifest", "That isn't available here.");
      const attachments = [];
      for (const a of input.attachments || []) attachments.push({ filename: a.filename, mimeType: a.mimeType, content: a.content && a.content.$file ? await b64(a.content.$file.data) : a.content });
      return { payload: await post("/draft", { to: input.to, cc: input.cc, subject: input.subject, body: input.body, htmlBody: input.htmlBody, attachments }) };
    },
  };
  const downloads = {
    save: async ({ filename, data }) => {
      const url = URL.createObjectURL(data), a = document.createElement("a");
      a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    },
  };
  window.claude = { use: async cap => (cap === "db" ? db : cap === "mcp" ? mcp : cap === "downloads" ? downloads : null) };
})();
