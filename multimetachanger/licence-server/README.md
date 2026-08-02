# 📦 Serveur de Licences — Guide de Déploiement Railway

## Prérequis
- Compte GitHub
- Compte Railway.app (gratuit)
- Compte Supabase (gratuit)
- Compte Resend.com (gratuit)

---

## Étape 1 — Créer la table Supabase

1. Allez sur [supabase.com](https://supabase.com) → New Project
2. Allez dans **SQL Editor** et collez ce code :

```sql
CREATE TABLE licenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_key TEXT UNIQUE NOT NULL,
    plan TEXT NOT NULL CHECK (plan IN ('monthly', 'lifetime')),
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    machine_id TEXT,
    payment_id TEXT
);
```

3. Récupérez dans **Settings > API** :
   - `SUPABASE_URL`
   - `SUPABASE_KEY` (anon key)

---

## Étape 2 — Déployer sur Railway

1. Poussez le dossier `licence-server/` sur GitHub
2. Allez sur [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Sélectionnez votre repo
4. Dans **Variables** → ajoutez :

```
SUPABASE_URL      = votre URL supabase
SUPABASE_KEY      = votre clé anon supabase
RESEND_API_KEY    = votre clé Resend
ADMIN_SECRET      = un mot de passe secret (inventez en un)
CRYPTOMUS_WEBHOOK_SECRET = le secret donné par Cryptomus
```

5. Railway vous donne une URL genre : `https://mon-app.railway.app`

---

## Étape 3 — Configurer Resend

1. [resend.com](https://resend.com) → créer compte
2. Ajouter votre domaine email (ou utiliser le domaine Resend gratuit)
3. Copier la clé API → mettre dans Railway

---

## Étape 4 — Configurer Cryptomus

1. [cryptomus.com](https://cryptomus.com) → créer compte → KYC
2. Créer des liens de paiement :
   - **Plan Mensuel** : 15€, `order_id` = `monthly-{email_client}`
   - **Plan À Vie** : 99€, `order_id` = `lifetime-{email_client}`
3. Webhook URL : `https://mon-app.railway.app/api/webhook/cryptomus`
4. Copier le Webhook Secret → mettre dans Railway

---

## Étape 5 — Mettre à jour le bot

Dans `license_check.py`, remplacez :
```python
LICENSE_SERVER_URL = "https://TON-APP.railway.app"
```
par votre vraie URL Railway.

---

## Tester manuellement (créer une licence de test)

```bash
curl -X POST https://mon-app.railway.app/api/admin/create \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: VOTRE_ADMIN_SECRET" \
  -d '{"email": "test@test.com", "plan": "monthly"}'
```

Vous recevrez par email votre clé de test !
