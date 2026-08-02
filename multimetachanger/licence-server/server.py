import os
import uuid
import secrets
import hashlib
import hmac
import json
import requests as http_requests
from datetime import datetime, timedelta, timezone

from flask import Flask, request, jsonify
from supabase import create_client, Client
import resend

app = Flask(__name__)

# CORS pour la page de vente
@app.after_request
def add_cors(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Admin-Secret'
    return response

@app.route('/', defaults={'path': ''}, methods=['OPTIONS'])
@app.route('/<path:path>', methods=['OPTIONS'])
def handle_options(path):
    return jsonify({}), 200

# ============================================================
# CONFIGURATION (variables d'environnement sur Railway)
# ============================================================
SUPABASE_URL             = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY             = os.environ.get("SUPABASE_KEY", "")
RESEND_API_KEY           = os.environ.get("RESEND_API_KEY", "")
ADMIN_SECRET             = os.environ.get("ADMIN_SECRET", "changeme")
NOWPAYMENTS_IPN_SECRET   = os.environ.get("CRYPTOMUS_WEBHOOK_SECRET", "")
NOWPAYMENTS_API_KEY      = os.environ.get("NOWPAYMENTS_API_KEY", "")
NOWPAYMENTS_CALLBACK_URL = "https://web-production-e8248.up.railway.app/api/webhook/nowpayments"
NOWPAYMENTS_SUCCESS_URL  = "https://andryherv2838.github.io/multimetachanger-site/?payment=success"
NOWPAYMENTS_CANCEL_URL   = "https://andryherv2838.github.io/multimetachanger-site/?payment=cancel"

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL else None
resend.api_key = RESEND_API_KEY

# ============================================================
# UTILITAIRES
# ============================================================

def generate_license_key():
    """Génère une clé unique format MMC-XXXX-XXXX-XXXX-XXXX"""
    parts = [secrets.token_hex(4).upper() for _ in range(4)]
    return "MMC-" + "-".join(parts)

def send_license_email(email: str, license_key: str, plan: str, expires_at=None):
    """Envoie la clé de licence par email via Resend."""
    plan_label = "À Vie ♾️" if plan == "lifetime" else "Mensuel 📅"
    expires_text = ""
    if expires_at:
        expires_text = f"\n⏳ Votre abonnement est valide jusqu'au : {expires_at.strftime('%d/%m/%Y')}"

    html_body = f"""
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: auto; background: #0f0f1a; color: #e2e8f0; border-radius: 16px; overflow: hidden;">
      <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 40px; text-align: center;">
        <h1 style="color: white; font-size: 2rem; margin: 0;">🔑 MultiMetaChanger</h1>
        <p style="color: rgba(255,255,255,0.8); margin-top: 0.5rem;">Votre licence est prête !</p>
      </div>
      <div style="padding: 40px;">
        <p>Bonjour,</p>
        <p>Merci pour votre achat ! Votre paiement a bien été confirmé.</p>
        <p style="margin-bottom: 0.5rem;"><strong>Plan :</strong> {plan_label}</p>
        
        <div style="background: #1a1a2e; border: 1px solid rgba(99,102,241,0.4); border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
          <p style="color: #a5b4fc; font-size: 0.85rem; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 2px;">Votre clé de licence</p>
          <p style="font-family: 'Courier New', monospace; font-size: 1.4rem; font-weight: bold; color: #818cf8; letter-spacing: 4px; margin: 0;">{license_key}</p>
        </div>
        {expires_text}

        <div style="background: rgba(99,102,241,0.1); border-radius: 12px; padding: 20px; margin-top: 24px;">
          <p style="font-weight: bold; color: #a5b4fc; margin-top: 0;">📋 Comment activer :</p>
          <ol style="padding-left: 1.2rem; line-height: 2;">
            <li>Téléchargez et lancez <strong>MultiMetaChanger</strong></li>
            <li>Sur l'écran d'accueil, entrez votre clé ci-dessus</li>
            <li>Cliquez sur <strong>"Activer ma licence"</strong></li>
            <li>Profitez-en ! 🚀</li>
          </ol>
        </div>

        <p style="color: #64748b; font-size: 0.85rem; margin-top: 32px;">
          Conservez cet email précieusement. En cas de problème, contactez-nous en répondant à ce mail.
        </p>
      </div>
    </div>
    """

    try:
        resend.Emails.send({
            "from": "MultiMetaChanger <onboarding@resend.dev>",
            "to": [email],
            "subject": f"🔑 Votre licence MultiMetaChanger — {plan_label}",
            "html": html_body,
        })
        return True
    except Exception as e:
        print(f"[EMAIL ERROR] {e}")
        return False

def create_license_in_db(email: str, plan: str, payment_id: str = None):
    """Crée une licence dans Supabase et retourne la clé."""
    key = generate_license_key()
    now = datetime.now(timezone.utc)
    expires_at = None

    if plan == "monthly":
        expires_at = now + timedelta(days=30)

    data = {
        "license_key": key,
        "plan": plan,
        "email": email,
        "created_at": now.isoformat(),
        "expires_at": expires_at.isoformat() if expires_at else None,
        "is_active": True,
        "payment_id": payment_id,
    }

    if supabase:
        supabase.table("licenses").insert(data).execute()

    return key, expires_at

# ============================================================
# ENDPOINT 1 : Validation de licence (appelé par le bot)
# ============================================================
@app.route("/api/validate", methods=["GET"])
def validate_license():
    key = request.args.get("key", "").strip().upper()
    machine_id = request.args.get("machine_id", "")

    if not key or not key.startswith("MMC-"):
        return jsonify({"valid": False, "reason": "Format de clé invalide"}), 400

    if not supabase:
        return jsonify({"valid": False, "reason": "Serveur non configuré"}), 500

    try:
        result = supabase.table("licenses").select("*").eq("license_key", key).single().execute()
        license_data = result.data

        if not license_data:
            return jsonify({"valid": False, "reason": "Clé introuvable"}), 404

        if not license_data.get("is_active"):
            return jsonify({"valid": False, "reason": "Licence désactivée"}), 403

        # Vérification expiration (mensuel)
        if license_data.get("expires_at"):
            expires = datetime.fromisoformat(license_data["expires_at"])
            if expires < datetime.now(timezone.utc):
                # Désactiver automatiquement
                supabase.table("licenses").update({"is_active": False}).eq("license_key", key).execute()
                return jsonify({"valid": False, "reason": "Abonnement expiré. Renouvelez sur notre site."}), 403

        # (Optionnel) Lier au machine_id si pas encore fait
        if machine_id and not license_data.get("machine_id"):
            supabase.table("licenses").update({"machine_id": machine_id}).eq("license_key", key).execute()
        elif machine_id and license_data.get("machine_id") and license_data["machine_id"] != machine_id:
            return jsonify({"valid": False, "reason": "Cette clé est déjà utilisée sur un autre appareil."}), 403

        expires_str = ""
        if license_data.get("expires_at"):
            expires_dt = datetime.fromisoformat(license_data["expires_at"])
            expires_str = expires_dt.strftime("%d/%m/%Y")

        return jsonify({
            "valid": True,
            "plan": license_data["plan"],
            "expires": expires_str or "jamais",
        })

    except Exception as e:
        print(f"[VALIDATE ERROR] {e}")
        return jsonify({"valid": False, "reason": "Erreur serveur"}), 500

# ============================================================
# ENDPOINT 2 : Webhook NOWPayments (paiement confirmé)
# ============================================================
@app.route("/api/webhook/nowpayments", methods=["POST"])
def nowpayments_webhook():
    data = request.json or {}
    print(f"[WEBHOOK] NOWPayments reçu : {json.dumps(data)[:200]}")

    # Vérification signature HMAC-SHA512
    if CRYPTOMUS_WEBHOOK_SECRET:  # on réutilise la variable pour le secret NOWPayments
        sig_received = request.headers.get("x-nowpayments-sig", "")
        sorted_data = json.dumps(data, sort_keys=True, separators=(',', ':'))
        expected_sig = hmac.new(
            CRYPTOMUS_WEBHOOK_SECRET.encode(),
            sorted_data.encode(),
            hashlib.sha512
        ).hexdigest()
        if sig_received != expected_sig:
            print("[WEBHOOK] Signature invalide !")
            return jsonify({"error": "Invalid signature"}), 403

    # NOWPayments : statut "finished" = paiement confirmé
    status = data.get("payment_status", "")
    if status != "finished":
        print(f"[WEBHOOK] Statut ignoré : {status}")
        return jsonify({"ok": True, "ignored": True})

    # Récupérer les infos
    order_id   = data.get("order_id", "")     # format : "monthly-email@client.com"
    payment_id = str(data.get("payment_id", ""))

    # Décoder order_id : "plan-email"
    parts = order_id.split("-", 1)
    if len(parts) < 2:
        print(f"[WEBHOOK] Order ID invalide : {order_id}")
        return jsonify({"error": "Invalid order_id"}), 400

    plan  = parts[0]   # "monthly" ou "lifetime"
    email = parts[1]   # "john@doe.com"

    if plan not in ("monthly", "lifetime"):
        return jsonify({"error": "Plan inconnu"}), 400

    # Créer la licence et envoyer l'email
    license_key, expires_at = create_license_in_db(email, plan, payment_id)
    print(f"[WEBHOOK] Licence créée : {license_key} → {email} ({plan})")
    send_license_email(email, license_key, plan, expires_at)

    return jsonify({"ok": True, "license_key": license_key})


# ============================================================
# ENDPOINT 3 : Créer une facture NOWPayments (appelé par page de vente)
# ============================================================
@app.route("/api/create-payment", methods=["POST"])
def create_payment():
    data  = request.json or {}
    email = data.get("email", "").strip().lower()
    plan  = data.get("plan", "monthly")

    if not email or "@" not in email:
        return jsonify({"error": "Email invalide"}), 400
    if plan not in ("monthly", "lifetime"):
        return jsonify({"error": "Plan invalide"}), 400

    price = 15 if plan == "monthly" else 99
    order_id = f"{plan}-{email}"
    description = f"MultiMetaChanger — Plan {'Mensuel' if plan == 'monthly' else 'À Vie'}"

    if not NOWPAYMENTS_API_KEY:
        return jsonify({"error": "Paiement non configuré"}), 500

    try:
        resp = http_requests.post(
            "https://api.nowpayments.io/v1/invoice",
            headers={
                "x-api-key": NOWPAYMENTS_API_KEY,
                "Content-Type": "application/json"
            },
            json={
                "price_amount": price,
                "price_currency": "eur",
                "order_id": order_id,
                "order_description": description,
                "ipn_callback_url": NOWPAYMENTS_CALLBACK_URL,
                "success_url": NOWPAYMENTS_SUCCESS_URL,
                "cancel_url": NOWPAYMENTS_CANCEL_URL,
            },
            timeout=10
        )
        result = resp.json()
        invoice_url = result.get("invoice_url", "")
        if not invoice_url:
            print(f"[PAYMENT ERROR] {result}")
            return jsonify({"error": "Impossible de créer la facture"}), 500

        print(f"[PAYMENT] Facture créée pour {email} ({plan}) → {invoice_url}")
        return jsonify({"ok": True, "payment_url": invoice_url})

    except Exception as e:
        print(f"[PAYMENT ERROR] {e}")
        return jsonify({"error": str(e)}), 500


# ============================================================
# ENDPOINT 4 : Créer une licence manuellement (admin)
# ============================================================
@app.route("/api/admin/create", methods=["POST"])
def admin_create():
    secret = request.headers.get("X-Admin-Secret", "")
    if secret != ADMIN_SECRET:
        return jsonify({"error": "Non autorisé"}), 403

    data = request.json or {}
    email = data.get("email", "")
    plan  = data.get("plan", "monthly")

    if not email or plan not in ("monthly", "lifetime"):
        return jsonify({"error": "email et plan requis (monthly/lifetime)"}), 400

    key, expires_at = create_license_in_db(email, plan)
    send_license_email(email, key, plan, expires_at)

    return jsonify({
        "ok": True,
        "license_key": key,
        "email": email,
        "plan": plan,
        "expires_at": expires_at.isoformat() if expires_at else None,
    })

# ============================================================
# ENDPOINT 4 : Lister les licences (admin)
# ============================================================
@app.route("/api/admin/list", methods=["GET"])
def admin_list():
    secret = request.headers.get("X-Admin-Secret", "")
    if secret != ADMIN_SECRET:
        return jsonify({"error": "Non autorisé"}), 403

    if not supabase:
        return jsonify([])

    result = supabase.table("licenses").select("*").order("created_at", desc=True).execute()
    return jsonify(result.data)

# ============================================================
# ENDPOINT 5 : Health check
# ============================================================
@app.route("/", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "MultiMetaChanger License Server"})

# ============================================================
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port, debug=False)
