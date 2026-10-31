export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const json = (o, s = 200) => Response.json(o, { status: s });
    if (url.pathname === "/api/health")
      return json({ ai: Boolean(env.GEMINI_API_KEY) });
    if (url.pathname === "/api/generate" && request.method === "POST") {
      if (!env.GEMINI_API_KEY) return json({ error: "IA non configurée." }, 503);
      let prompt;
      try { ({ prompt } = await request.json()); } catch { return json({ error: "Requête invalide." }, 400); }
      if (typeof prompt !== "string" || prompt.length < 5 || prompt.length > 4000)
        return json({ error: "Texte invalide (5 à 4000 caractères)." }, 400);
      const model = env.GEMINI_MODEL || "gemini-2.0-flash";
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          { method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { maxOutputTokens: 1200 } }) });
        if (r.status === 429) return json({ error: "Quota IA atteint, réessayez plus tard." }, 429);
        if (!r.ok) return json({ error: "Le service d'IA a échoué." }, 502);
        const j = await r.json();
        const text = j.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
        return text ? json({ text }) : json({ error: "Réponse vide." }, 502);
      } catch { return json({ error: "Erreur serveur." }, 500); }
    }
    return new Response("Introuvable", { status: 404 });
  }
};
