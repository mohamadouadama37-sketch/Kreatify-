const PROVIDERS = [
  { key: "GROQ_API_KEY", url: "https://api.groq.com/openai/v1/chat/completions", model: "openai/gpt-oss-120b" },
  { key: "MISTRAL_API_KEY", url: "https://api.mistral.ai/v1/chat/completions", model: "mistral-small-latest" },
  { key: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", model: "" },
];
const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
const unhex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
const sha = async s => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
async function pbkdf2(pw, salt, iter) {
  const k = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, k, 256));
}
function same(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
const rand = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const json = (o, s = 200, h = {}) => Response.json(o, { status: s, headers: h });
const cookie = (t, age) => "kt=" + t + "; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=" + age;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith("/api/")) return new Response("Introuvable", { status: 404 });
    const p = PROVIDERS.find(x => env[x.key]);
    if (path === "/api/health") return json({ ai: Boolean(p), accounts: Boolean(env.DB) });
    if (request.method === "POST") {
      const origin = request.headers.get("Origin");
      if (origin) { let ok = false; try { ok = new URL(origin).host === url.host; } catch {} if (!ok) return json({ error: "Origine refusée." }, 403); }
    }
    if (!env.DB) return json({ error: "Comptes non configurés (base de données absente)." }, 503);
    const iter = parseInt(env.PBKDF2_ITER) || 100000;
    const ip = request.headers.get("CF-Connecting-IP") || "inconnue";
    async function limited() {
      try {
        if (env.IP_LIMITER && !(await env.IP_LIMITER.limit({ key: ip })).success) return "Trop de requêtes, patientez une minute.";
        if (env.GLOBAL_LIMITER && !(await env.GLOBAL_LIMITER.limit({ key: "global" })).success) return "Service très sollicité, réessayez dans une minute.";
      } catch {}
      return null;
    }
    async function newSession(uid) {
      const t = rand(32), exp = Math.floor(Date.now() / 1000) + 2592000;
      await env.DB.prepare("DELETE FROM sessions WHERE expires_at<?").bind(Math.floor(Date.now() / 1000)).run();
      await env.DB.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha(t), uid, exp).run();
      return cookie(t, 2592000);
    }
    async function currentUser() {
      const m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)kt=([a-f0-9]{64})/);
      if (!m) return null;
      return await env.DB.prepare("SELECT u.id AS id,u.email AS email,u.salt AS salt,u.hash AS hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?").bind(await sha(m[1]), Math.floor(Date.now() / 1000)).first();
    }
    const day = new Date().toISOString().slice(0, 10);
    const limit = parseInt(env.FREE_DAILY_LIMIT) || 5;
    async function used(uid) { const r = await env.DB.prepare("SELECT count FROM usage WHERE user_id=? AND day=?").bind(uid, day).first(); return r ? r.count : 0; }
    let body = {};
    if (request.method === "POST") { try { body = await request.json(); } catch { return json({ error: "Requête invalide." }, 400); } }

    try {
      if (path === "/api/register" && request.method === "POST") {
        const l = await limited(); if (l) return json({ error: l }, 429);
        const email = String(body.email || "").trim().toLowerCase(), pw = String(body.password || "");
        if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(email) || email.length > 254) return json({ error: "E-mail invalide." }, 400);
        if (pw.length < 8 || pw.length > 200) return json({ error: "Mot de passe : 8 à 200 caractères." }, 400);
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const hash = await pbkdf2(pw, salt, iter);
        let r;
        try { r = await env.DB.prepare("INSERT INTO users(email,salt,hash,created_at) VALUES(?,?,?,?)").bind(email, hex(salt), hash, Math.floor(Date.now() / 1000)).run(); }
        catch { return json({ error: "Inscription impossible (e-mail déjà utilisé ?)." }, 409); }
        const c = await newSession(r.meta.last_row_id);
        return json({ email }, 200, { "Set-Cookie": c });
      }
      if (path === "/api/login" && request.method === "POST") {
        const l = await limited(); if (l) return json({ error: l }, 429);
        const email = String(body.email || "").trim().toLowerCase(), pw = String(body.password || "");
        if (pw.length > 200) return json({ error: "Identifiants incorrects." }, 401);
        const u = await env.DB.prepare("SELECT id,salt,hash FROM users WHERE email=?").bind(email).first();
        const h = await pbkdf2(pw, u ? unhex(u.salt) : new Uint8Array(16), iter);
        if (!u || !same(h, u.hash)) return json({ error: "Identifiants incorrects." }, 401);
        return json({ email }, 200, { "Set-Cookie": await newSession(u.id) });
      }
      if (path === "/api/logout" && request.method === "POST") {
        const m = (request.headers.get("Cookie") || "").match(/(?:^|;\s*)kt=([a-f0-9]{64})/);
        if (m) await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha(m[1])).run();
        return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
      }
      const u = await currentUser();
      if (path === "/api/me") {
        if (!u) return json({ error: "Non connecté." }, 401);
        return json({ email: u.email, used: await used(u.id), limit });
      }
      if (path === "/api/delete-account" && request.method === "POST") {
        if (!u) return json({ error: "Non connecté." }, 401);
        const l = await limited(); if (l) return json({ error: l }, 429);
        const h = await pbkdf2(String(body.password || "").slice(0, 200), unhex(u.salt), iter);
        if (!same(h, u.hash)) return json({ error: "Mot de passe incorrect." }, 403);
        await env.DB.batch([
          env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(u.id),
          env.DB.prepare("DELETE FROM usage WHERE user_id=?").bind(u.id),
          env.DB.prepare("DELETE FROM users WHERE id=?").bind(u.id)]);
        return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
      }
      if (path === "/api/generate" && request.method === "POST") {
        if (!u) return json({ error: "Connectez-vous pour utiliser l'IA." }, 401);
        const l = await limited(); if (l) return json({ error: l }, 429);
        if (!p) return json({ error: "IA non configurée." }, 503);
        const prompt = body.prompt;
        if (typeof prompt !== "string" || prompt.length < 5 || prompt.length > 4000) return json({ error: "Texte invalide (5 à 4000 caractères)." }, 400);
        const model = env.AI_MODEL || p.model;
        if (!model) return json({ error: "Ajoutez la variable AI_MODEL." }, 503);
        await env.DB.prepare("INSERT OR IGNORE INTO usage(user_id,day,count) VALUES(?,?,0)").bind(u.id, day).run();
        const q = await env.DB.prepare("UPDATE usage SET count=count+1 WHERE user_id=? AND day=? AND count<?").bind(u.id, day, limit).run();
        if (!q.meta.changes) return json({ error: "Limite gratuite atteinte (" + limit + "/jour). Revenez demain." }, 429);
        const refund = () => env.DB.prepare("UPDATE usage SET count=count-1 WHERE user_id=? AND day=? AND count>0").bind(u.id, day).run();
        try {
          const r = await fetch(p.url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + env[p.key] },
            body: JSON.stringify({ model, max_tokens: 1200, messages: [{ role: "user", content: prompt }] }) });
          if (!r.ok) { await refund(); return json({ error: r.status === 429 ? "Quota IA atteint, réessayez plus tard." : "Le service d'IA a échoué." }, r.status === 429 ? 429 : 502); }
          const j = await r.json();
          const text = j.choices?.[0]?.message?.content || "";
          if (!text) { await refund(); return json({ error: "Réponse vide." }, 502); }
          return json({ text, used: await used(u.id), limit });
        } catch { await refund(); return json({ error: "Erreur serveur." }, 500); }
      }
    } catch { return json({ error: "Erreur serveur." }, 500); }
    return json({ error: "Introuvable." }, 404);
  },
};
