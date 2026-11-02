import uiautomator2 as u2
import subprocess
import time

try:
    print("[*] Connecting to adb...")
    subprocess.run(['C:\\LDPlayer\\LDPlayer9\\adb.exe', 'connect', '127.0.0.1:5555'])
    subprocess.run(['C:\\LDPlayer\\LDPlayer9\\adb.exe', 'connect', '127.0.0.1:5559'])
    subprocess.run(['C:\\LDPlayer\\LDPlayer9\\adb.exe', 'connect', '127.0.0.1:5567'])
    
    # Try connecting to the first available device
    d = u2.connect()
    print("Device:", d.info.get('model'))
    
    print("[*] Launching Urban VPN...")
    d.app_start('com.urbanvpn.android')
    time.sleep(10)
    
    print("[*] Dumping UI...")
    with open('vpn_debug.xml', 'w', encoding='utf-8') as f:
        f.write(d.dump_hierarchy())
    print("[+] Dumped to vpn_debug.xml")
except Exception as e:
    print("[-] Error:", e)
