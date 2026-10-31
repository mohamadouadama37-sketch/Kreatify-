export async function onRequestPost({ request, env }) {
  const err = (m, s) => Response.json({ error: m }, { status: s });
  if (!env.GEMINI_API_KEY) return err("IA non configurée.", 503);
  let prompt;
  try { ({ prompt } = await request.json()); } catch { return err("Requête invalide.", 400); }
  if (typeof prompt !== "string" || prompt.length < 5 || prompt.length > 4000)
    return err("Texte invalide (5 à 4000 caractères).", 400);
  const model = env.GEMINI_MODEL || "gemini-2.0-flash";
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      { method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 1200 } }) });
    if (r.status === 429) return err("Quota IA atteint, réessayez plus tard.", 429);
    if (!r.ok) return err("Le service d'IA a échoué.", 502);
    const j = await r.json();
    const text = j.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || "";
    if (!text) return err("Réponse vide.", 502);
    return Response.json({ text });
  } catch { return err("Erreur serveur.", 500); }
}
