const PROVIDERS = [
  { key: "GROQ_API_KEY", url: "https://api.groq.com/openai/v1/chat/completions", model: "llama-3.3-70b-versatile" },
  { key: "MISTRAL_API_KEY", url: "https://api.mistral.ai/v1/chat/completions", model: "mistral-small-latest" },
  { key: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", model: "" },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const json = (o, s = 200) => Response.json(o, { status: s });
    const p = PROVIDERS.find(x => env[x.key]);
    if (url.pathname === "/api/health") return json({ ai: Boolean(p) });
    if (url.pathname === "/api/generate" && request.method === "POST") {
      if (!p) return json({ error: "IA non configurée." }, 503);
      let prompt;
      try { ({ prompt } = await request.json()); } catch { return json({ error: "Requête invalide." }, 400); }
      if (typeof prompt !== "string" || prompt.length < 5 || prompt.length > 4000)
        return json({ error: "Texte invalide (5 à 4000 caractères)." }, 400);
      const model = env.AI_MODEL || p.model;
      if (!model) return json({ error: "Ajoutez la variable AI_MODEL." }, 503);
      try {
        const r = await fetch(p.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + env[p.key] },
          body: JSON.stringify({ model, max_tokens: 1200, messages: [{ role: "user", content: prompt }] }),
        });
        if (r.status === 429) return json({ error: "Quota IA atteint, réessayez plus tard." }, 429);
        if (!r.ok) return json({ error: "Le service d'IA a échoué." }, 502);
        const j = await r.json();
        const text = j.choices?.[0]?.message?.content || "";
        return text ? json({ text }) : json({ error: "Réponse vide." }, 502);
      } catch { return json({ error: "Erreur serveur." }, 500); }
    }
    return new Response("Introuvable", { status: 404 });
  },
};
