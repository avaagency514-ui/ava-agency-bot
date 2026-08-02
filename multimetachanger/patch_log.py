import os

with open('app.py', 'r', encoding='utf-8') as f:
    c = f.read()

# Revert the old bad replacement
bad_injection = '''    data = request.json or {}
    
    import json
    with open('last_payload.log', 'w') as log_f:
        json.dump(data, log_f, indent=2)'''
c = c.replace(bad_injection, '    data = request.json or {}')

# Add specific injections
str1 = '''def start_processing():
    data = request.json or {}'''
rep1 = '''def start_processing():
    data = request.json or {}
    import json
    with open('process_payload.log', 'w') as f: json.dump(data, f)'''
c = c.replace(str1, rep1)

str2 = '''def start_bulk_processing():
    """Traite tous les fichiers d'un dossier source, en dupliquant le dossier complet N fois."""
    data = request.json or {}'''
rep2 = '''def start_bulk_processing():
    """Traite tous les fichiers d'un dossier source, en dupliquant le dossier complet N fois."""
    data = request.json or {}
    import json
    with open('process_payload.log', 'w') as f: json.dump(data, f)'''
c = c.replace(str2, rep2)

with open('app.py', 'w', encoding='utf-8') as f:
    f.write(c)

print('Success')
