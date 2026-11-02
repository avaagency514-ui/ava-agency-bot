import uiautomator2 as u2

try:
    print("[*] Connecting...")
    d = u2.connect('emulator-5556')
    print("Info:", d.info)
    
    xml = d.dump_hierarchy()
    with open('proton_dump.xml', 'w', encoding='utf-8') as f:
        f.write(xml)
        
    print("[+] Dumped to proton_dump.xml")
except Exception as e:
    print("[-] Error:", e)
