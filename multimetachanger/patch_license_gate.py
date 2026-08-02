with open('app.py', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Add import at top
old_import = 'from flask import Flask, render_template, request, jsonify, Response'
new_import = 'from flask import Flask, render_template, request, jsonify, Response, redirect, url_for\nfrom license_check import check_license_at_startup, validate_license_online, save_license_key, load_license_key'
c = c.replace(old_import, new_import)

# 2. Inject license gate before if __name__
license_block = '''
# ============================================================
# LICENSE GATE
# ============================================================
LICENSE_ACTIVE = check_license_at_startup(app)

@app.route('/license')
def license_page():
    return render_template('license.html')

@app.route('/api/activate-license', methods=['POST'])
def activate_license():
    global LICENSE_ACTIVE
    data = request.json or {}
    key = data.get('key', '').strip().upper()
    result = validate_license_online(key)
    if result.get('valid'):
        save_license_key(key)
        app.config['LICENSE_VALID'] = True
        app.config['LICENSE_PLAN'] = result.get('plan', '?')
        app.config['LICENSE_EXPIRES'] = result.get('expires', 'jamais')
        LICENSE_ACTIVE = True
        return jsonify(result)
    return jsonify(result), 403

@app.before_request
def require_license():
    exempt = ['/license', '/api/activate-license']
    if request.path in exempt or request.path.startswith('/static/'):
        return
    if not app.config.get('LICENSE_VALID', False):
        from flask import redirect, url_for
        return redirect(url_for('license_page'))

'''

old_run = "if __name__ == '__main__':"
c = c.replace(old_run, license_block + old_run, 1)

with open('app.py', 'w', encoding='utf-8') as f:
    f.write(c)
print('app.py patched with license gate')
