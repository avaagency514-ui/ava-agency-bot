import re

with open('page-de-vente/index.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Add modal and purchase JS before </body>
modal_code = '''
    <!-- MODAL ACHAT -->
    <div id="buy-modal" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:1000; align-items:center; justify-content:center; backdrop-filter:blur(8px);">
        <div style="background:#0f0f1e; border:1px solid rgba(99,102,241,0.4); border-radius:24px; padding:2.5rem; width:100%; max-width:440px; margin:1rem; box-shadow:0 30px 80px rgba(0,0,0,0.5);">
            <button onclick="closeBuyModal()" style="float:right; background:none; border:none; color:#64748b; font-size:1.5rem; cursor:pointer; line-height:1;">×</button>
            <h3 style="font-size:1.4rem; font-weight:800; color:#f1f5f9; margin-bottom:0.5rem;">🔑 Obtenir votre licence</h3>
            <p id="modal-plan-label" style="color:#818cf8; font-size:0.9rem; margin-bottom:1.5rem;"></p>
            
            <label style="display:block; font-size:0.82rem; font-weight:500; color:#94a3b8; text-transform:uppercase; letter-spacing:1px; margin-bottom:0.6rem;">Votre email</label>
            <input type="email" id="modal-email" placeholder="votre@email.com" style="width:100%; padding:1rem; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1); border-radius:12px; color:#e2e8f0; font-size:1rem; outline:none; margin-bottom:1.2rem; font-family:Inter,sans-serif;" />
            <p style="font-size:0.8rem; color:#475569; margin-bottom:1.5rem;">📧 Votre clé de licence sera envoyée à cet email après paiement.</p>
            
            <button id="modal-btn" onclick="proceedPayment()" style="width:100%; padding:1rem; background:linear-gradient(135deg,#6366f1,#8b5cf6); border:none; border-radius:12px; color:white; font-size:1rem; font-weight:700; cursor:pointer; box-shadow:0 6px 24px rgba(99,102,241,0.35);">
                Procéder au paiement →
            </button>
            <div id="modal-error" style="display:none; margin-top:1rem; padding:0.8rem; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:8px; color:#fca5a5; font-size:0.88rem;"></div>
        </div>
    </div>

    <script>
        const SERVER = "https://web-production-e8248.up.railway.app";
        let currentPlan = "monthly";

        function openBuyModal(plan) {
            currentPlan = plan;
            const labels = { monthly: "Plan Mensuel — 15€/mois", lifetime: "Plan À Vie — 99€ une fois" };
            document.getElementById("modal-plan-label").textContent = "💰 " + labels[plan];
            document.getElementById("modal-error").style.display = "none";
            document.getElementById("modal-email").value = "";
            document.getElementById("buy-modal").style.display = "flex";
            setTimeout(() => document.getElementById("modal-email").focus(), 100);
        }

        function closeBuyModal() {
            document.getElementById("buy-modal").style.display = "none";
        }

        // Fermer en cliquant dehors
        document.getElementById("buy-modal").addEventListener("click", function(e) {
            if (e.target === this) closeBuyModal();
        });

        async function proceedPayment() {
            const email = document.getElementById("modal-email").value.trim();
            const btn   = document.getElementById("modal-btn");
            const err   = document.getElementById("modal-error");

            if (!email || !email.includes("@")) {
                err.textContent = "❌ Veuillez entrer un email valide.";
                err.style.display = "block";
                return;
            }

            btn.textContent = "⏳ Création de la facture...";
            btn.disabled = true;
            err.style.display = "none";

            try {
                const resp = await fetch(SERVER + "/api/create-payment", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, plan: currentPlan })
                });
                const data = await resp.json();

                if (data.payment_url) {
                    window.location.href = data.payment_url;
                } else {
                    err.textContent = "❌ " + (data.error || "Erreur serveur, réessayez.");
                    err.style.display = "block";
                    btn.textContent = "Procéder au paiement →";
                    btn.disabled = false;
                }
            } catch(e) {
                err.textContent = "❌ Erreur de connexion. Réessayez dans un instant.";
                err.style.display = "block";
                btn.textContent = "Procéder au paiement →";
                btn.disabled = false;
            }
        }

        // Message succès/annulation
        const params = new URLSearchParams(window.location.search);
        if (params.get("payment") === "success") {
            alert("✅ Paiement confirmé ! Vérifiez votre email (et vos spams) pour votre clé de licence. 🎉");
        } else if (params.get("payment") === "cancel") {
            alert("❌ Paiement annulé. Revenez quand vous voulez !");
        }
    </script>
</body>'''

# Replace old closing body and buy buttons
html = html.replace(
    '<a href="LIEN_CRYPTOMUS_MENSUEL" class="btn-buy-outline" id="btn-monthly">Commencer →</a>',
    '<a href="#" onclick="openBuyModal(\'monthly\'); return false;" class="btn-buy-outline" id="btn-monthly">Commencer →</a>'
)
html = html.replace(
    '<a href="LIEN_CRYPTOMUS_LIFETIME" class="btn-buy" id="btn-lifetime">Acheter maintenant →</a>',
    '<a href="#" onclick="openBuyModal(\'lifetime\'); return false;" class="btn-buy" id="btn-lifetime">Acheter maintenant →</a>'
)
html = html.replace('</body>', modal_code)

with open('page-de-vente/index.html', 'w', encoding='utf-8') as f:
    f.write(html)
print('Page de vente mise à jour avec modal de paiement')
