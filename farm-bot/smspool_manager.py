import os
import time
import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
API_KEY = os.getenv("SMSPOOL_API_KEY")

class SMSPoolManager:
    def __init__(self, api_key=API_KEY):
        self.api_key = api_key
        self.base_url = "https://api.smspool.net"
        
    def order_instagram_us(self):
        """Commande un numéro US pour Instagram."""
        print("[*] Commande d'un numéro US via SMSPool...")
        # 1 = US, 457 = Instagram/Threads (ou 73 pour IG classique, on teste 457)
        url = f"{self.base_url}/purchase/sms?key={self.api_key}&country=1&service=457"
        
        for attempt in range(3):
            try:
                res = requests.get(url, timeout=10).json()
                if res.get("success") == 1:
                    number = res.get("number")
                    order_id = res.get("order_id")
                    print(f"[+] Numéro obtenu : {number} (ID: {order_id})")
                    return {"success": True, "number": number, "order_id": order_id}
                else:
                    print("[-] Erreur SMSPool :", res.get("message"))
                    # On teste avec le service ID classique 73 si 457 échoue
                    if "service" in str(res.get("message")).lower():
                        print("[*] Tentative avec l'ID de service 73...")
                        url_fallback = f"{self.base_url}/purchase/sms?key={self.api_key}&country=1&service=73"
                        res2 = requests.get(url_fallback, timeout=10).json()
                        if res2.get("success") == 1:
                            return {"success": True, "number": res2.get("number"), "order_id": res2.get("order_id")}
                    return {"success": False, "error": res.get("message")}
            except Exception as e:
                print(f"[-] Exception SMSPool (Essai {attempt+1}/3) :", e)
                time.sleep(3)
                
        return {"success": False, "error": "Erreur réseau répétée"}

    def order_instagram_fr(self):
        """Commande un numéro FR pour Instagram."""
        print("[*] Commande d'un numéro FR via SMSPool...")
        # 23 = France, 457 = Instagram/Threads
        url = f"{self.base_url}/purchase/sms?key={self.api_key}&country=23&service=457"
        
        for attempt in range(3):
            try:
                res = requests.get(url, timeout=10).json()
                if res.get("success") == 1:
                    number = res.get("number")
                    order_id = res.get("order_id")
                    print(f"[+] Numéro FR obtenu : {number} (ID: {order_id})")
                    return {"success": True, "number": number, "order_id": order_id}
                else:
                    print("[-] Erreur SMSPool :", res.get("message"))
                    # Fallback sur le service 73
                    if "service" in str(res.get("message")).lower():
                        print("[*] Tentative avec l'ID de service 73...")
                        url_fallback = f"{self.base_url}/purchase/sms?key={self.api_key}&country=23&service=73"
                        res2 = requests.get(url_fallback, timeout=10).json()
                        if res2.get("success") == 1:
                            return {"success": True, "number": res2.get("number"), "order_id": res2.get("order_id")}
                    return {"success": False, "error": res.get("message")}
            except Exception as e:
                print(f"[-] Exception SMSPool (Essai {attempt+1}/3) :", e)
                time.sleep(3)
                
        return {"success": False, "error": "Erreur réseau répétée"}

    def check_sms(self, order_id, timeout=120):
        """Vérifie l'arrivée du SMS en boucle."""
        print(f"[*] Attente du SMS pour la commande {order_id} (timeout={timeout}s)...")
        url = f"{self.base_url}/sms/check?key={self.api_key}&orderid={order_id}"
        
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                res = requests.get(url).json()
                status = res.get("status")
                # 3 = Completed/Received
                if status == 3:
                    code = res.get("sms")
                    print(f"[+] SMS Reçu ! Code : {code}")
                    return code
                elif status == 6:
                    print("[-] Commande annulée ou expirée.")
                    return None
            except Exception as e:
                pass
            
            time.sleep(5)
            
        print("[-] Timeout : Aucun SMS reçu.")
        return None

    def cancel_order(self, order_id):
        """Annule une commande si aucun SMS n'est arrivé."""
        print(f"[*] Annulation de la commande SMS {order_id}...")
        url = f"{self.base_url}/sms/cancel?key={self.api_key}&orderid={order_id}"
        requests.get(url)
