# Déployer Kreatify AI gratuitement (sans carte bancaire)

Contenu : `index.html` (site) + `functions/api/` (serveur IA, clé protégée).

## 1. Clé IA gratuite
1. Ouvrez https://aistudio.google.com puis « Get API key » → créez une clé.
2. Gardez-la secrète. Vérifiez le nom du modèle gratuit actuel (par défaut : gemini-2.0-flash) et les limites du palier gratuit.

## 2. Hébergement gratuit Cloudflare Pages (via GitHub)
ATTENTION : l'envoi par glisser-déposer du tableau de bord Cloudflare ne prend PAS en charge le dossier `functions` (le serveur IA). Utilisez GitHub (ou Wrangler).
1. Créez un compte gratuit sur github.com, puis un dépôt « kreatify » (New repository).
2. « Add file » > « Upload files » : envoyez le CONTENU du dossier décompressé (index.html, sw.js, manifest.webmanifest, icônes, LISEZMOI.md ET le dossier functions avec ses 2 fichiers). Vérifiez que `functions/api/generate.js` apparaît dans le dépôt. Commit.
3. Sur dash.cloudflare.com : Workers & Pages > Create > Pages > « Connect to Git » > autorisez GitHub > choisissez « kreatify ».
4. Réglages de build : Framework = None ; Build command = vide ; Output directory = / (ou vide). Save and Deploy.
5. Projet > Settings > Variables and secrets : ajoutez le secret `GEMINI_API_KEY` (et `GEMINI_MODEL` si besoin), puis redéployez.
Alternative : Wrangler (Node.js requis) : `npx wrangler pages deploy .` dans le dossier.

## 3. Tester
- Ouvrez `https://kreatify.pages.dev/api/health` : doit afficher `{"ai":true}`.
- Dans le site : Textes → Générer.

## 4. Protéger
- Cloudflare → Security → WAF → Rate limiting : limitez `/api/generate` (ex. 10 requêtes/min/IP, offre gratuite).
- Définissez une alerte/plafond côté Google AI Studio. Ne passez PAS en facturation.

## Limites actuelles (honnêtes)
- Pas de comptes : quotas et bibliothèque sont dans le navigateur (contournables, non synchronisés).
- Paiements, crédits, administration : non implémentés.
- Prochaine étape : comptes + base D1 (gratuit) avec quotas serveur.
- Avant lancement : vrai contact, textes légaux validés.

## Installer comme une application (PWA)
Après déploiement en https :
- Android (Chrome) : menu ⋮ → « Installer l'application » / « Ajouter à l'écran d'accueil ».
- iPhone (Safari) : Partager → « Sur l'écran d'accueil ».
- Ordinateur (Chrome/Edge) : icône d'installation dans la barre d'adresse.
Elle s'ouvre alors en plein écran avec son icône. La génération IA exige une connexion internet.
