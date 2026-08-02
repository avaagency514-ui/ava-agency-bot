import os

with open('app.py', 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Update generate_random_exif signature and logic
old_exif_func = '''def generate_random_exif():
    """Génère des métadonnées EXIF réalistes."""'''
new_exif_func = '''def generate_random_exif(profile="random"):
    """Génère des métadonnées EXIF réalistes."""'''
js = js.replace(old_exif_func, new_exif_func)

old_exif_logic = '''    make = random.choice(list(makes.keys()))
    brand = makes[make]'''
new_exif_logic = '''    if profile == "iphone":
        make = "Apple"
    else:
        make = random.choice(list(makes.keys()))
    brand = makes[make]'''
js = js.replace(old_exif_logic, new_exif_logic)

# 2. Update start_processing
old_start = '''    do_exif = data.get('exif', True)
    do_hash = data.get('hash', True)'''
new_start = '''    do_exif = data.get('exif', True)
    exif_profile = data.get('exif_profile', 'random')
    do_hash = data.get('hash', True)'''
js = js.replace(old_start, new_start)

# 3. Update generate_progress
old_gen = '''        if do_exif:
            meta = generate_random_exif()'''
new_gen = '''        if do_exif:
            meta = generate_random_exif(exif_profile)'''
js = js.replace(old_gen, new_gen)

with open('app.py', 'w', encoding='utf-8') as f:
    f.write(js)
print('Patched app.py')
