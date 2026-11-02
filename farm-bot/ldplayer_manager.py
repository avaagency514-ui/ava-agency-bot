import os
import subprocess
import time

LDCONSOLE_PATH = r"C:\LDPlayer\LDPlayer9\ldconsole.exe"

class LDPlayerManager:
    def __init__(self, console_path=LDCONSOLE_PATH):
        self.console_path = console_path

    def run_cmd(self, *args):
        cmd = [self.console_path] + list(args)
        # print("Running:", " ".join(cmd))
        result = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='ignore')
        return result.stdout.strip()

    def list_instances(self):
        """Retourne la liste des instances avec leurs infos."""
        out = self.run_cmd("list2")
        instances = []
        if out:
            for line in out.split('\n'):
                parts = line.split(',')
                if len(parts) >= 5:
                    instances.append({
                        'id': parts[0],
                        'name': parts[1],
                        'top_window': parts[2],
                        'bind_window': parts[3],
                        'android_started': parts[4],
                        'pid': parts[5],
                        'pid_vbox': parts[6]
                    })
        return instances

    def clone_instance(self, name_new, name_src):
        """Clone une instance existante."""
        print(f"[*] Clonage de '{name_src}' vers '{name_new}'...")
        self.run_cmd("copy", "--name", name_new, "--from", name_src)
        print(f"[+] Clone '{name_new}' terminé.")

    def launch_instance(self, name):
        """Lance une instance (arrière-plan, ADB fonctionnel)."""
        print(f"[*] Lancement de l'instance '{name}' (Arrière-plan)...")
        self.run_cmd("launch", "--name", name)
        
    def quit_instance(self, name):
        """Ferme une instance."""
        print(f"[*] Fermeture de l'instance '{name}'...")
        self.run_cmd("quit", "--name", name)

if __name__ == "__main__":
    ld = LDPlayerManager()
    print("Instances actuelles :")
    for inst in ld.list_instances():
        print(f" - [{inst['id']}] {inst['name']} (Démarré: {inst['android_started']})")
