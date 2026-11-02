import uiautomator2 as u2

try:
    d = u2.connect("emulator-5556")
    print("[*] Scan de l'écran IG (Dump UI)...")
    ui_dump = d.dump_hierarchy()
    
    with open("ui_instagram.xml", "w", encoding="utf-8") as f:
        f.write(ui_dump)
        
    print("[+] Scan terminé et sauvegardé dans ui_instagram.xml")
except Exception as e:
    print("Erreur:", e)
