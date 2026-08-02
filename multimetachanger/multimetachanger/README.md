# MultiMetaChanger v2.0 🛠️
### Logiciel local d'anonymisation et de contournement anti-détection pour multicomptes.

**MultiMetaChanger** est un outil local doté d'une interface graphique moderne qui vous permet de générer des variantes uniques d'images et de vidéos. Il est spécialement conçu pour les créateurs gérant plusieurs comptes (multicomptes) sur des réseaux sociaux (TikTok, Instagram, Facebook, etc.) afin d'éviter la détection de contenu dupliqué.

---

### 👨‍💻 Créé par
* **Nom** : Hervé OFM
* **Telegram** : [@herve2838](https://t.me/herve2838)
> N'hésitez pas à me contacter pour la création d'outils sur-mesure qui vous faciliteront la vie !

---

## 🚀 Fonctionnalités principales

1. **Anonymisation d'images (Pixel Magic)** :
   * Modifie de manière imperceptible les pixels pour générer un hash SHA256/MD5 complètement unique à chaque fichier sans altérer la qualité visuelle.
   * **Nettoyage IA** : Supprime définitivement les métadonnées de génération d'images IA (signatures C2PA, tags XMP, métadonnées JUMBF, etc.) tout en préservant la fidélité des couleurs (profils ICC).
   * **EXIF Réaliste** : Génère un profil d'appareil photo authentique (iPhone 16 Pro Max, Samsung S25 Ultra, Google Pixel 9, Canon, Sony) avec des dates de prise de vue cohérentes et des coordonnées GPS géolocalisées uniques (Paris, New York, Tokyo, etc.).

2. **Traitement de vidéos** :
   * **Copie rapide (Instantané)** : Modifie les métadonnées internes du conteneur QuickTime/MP4 (date de création, appareil photo fictif, etc.) sans ré-encoder la vidéo. Le hash du fichier est modifié en une fraction de seconde.
   * **Ré-encodage complet (Pixel Hash unique)** : Ré-encode la vidéo avec de légères variations structurelles (modification du GOP, FPS, et bitrate). Ce mode est plus lent mais rend le flux d'images 100% unique face aux scanners de pixels avancés (comme celui de TikTok).

3. **Monteur de Captions Dynamiques (Vidéos)** :
   * Incruste automatiquement vos phrases d'accroche (hooks) au hasard sur chaque copie vidéo générée.
   * **Support complet** : Importez un fichier `.txt` ou collez directement des colonnes depuis Google Sheets.
   * **Syntaxe intelligente** : Utilisez `/` pour un saut de ligne, `//` pour deux sauts, `*texte*` pour convertir un mot en MAJUSCULE et `_texte_` pour créer un espacement stylisé.
   * **Tirage sans remise** : L'algorithme garantit que chaque vidéo reçoit une phrase 100% unique tant que votre liste n'est pas épuisée.

4. **Deux modes de travail** :
   * **📄 Fichier unique** : Traite un seul fichier pour générer N copies uniques.
   * **📁 Dossier entier (Bulk)** : Traite un dossier complet contenant plusieurs médias pour cloner ce dossier N fois. Chaque dossier de sortie contient la même structure et les mêmes noms de fichiers originaux, mais chaque fichier est unique numériquement.

---

## 📦 Prérequis sous Windows

Le logiciel s'exécute localement sur votre ordinateur sans nécessiter d'upload sur internet. Vous avez uniquement besoin de :
1. **Python 3** (installé et ajouté au PATH).
2. **FFmpeg** *(optionnel - uniquement requis pour les vidéos)*.

---

## 🛠️ Démarrage rapide

1. Rendez-vous dans le dossier du logiciel.
2. Double-cliquez sur le fichier **`lancer.bat`**.
   * Au premier démarrage, le script configure automatiquement un environnement virtuel (`venv`) et installe les bibliothèques requises (`Flask`, `Pillow`, `piexif`, `numpy`, `pilmoji`).
   * Lors des démarrages suivants, il lance directement l'application.
3. L'interface graphique s'ouvre automatiquement dans votre navigateur web à l'adresse : **`http://127.0.0.1:5000`** *(ou un port alternatif libre)*.
4. **Laissez la console noire ouverte** pendant que vous utilisez le logiciel. Fermez-la pour éteindre le serveur.

---

## 🎥 Activation du traitement vidéo (FFmpeg)

Si vous traitez des vidéos, l'application affichera un avertissement si FFmpeg n'est pas détecté. Pour l'installer facilement sans toucher aux paramètres système de Windows :

1. Téléchargez la version Windows simplifiée de FFmpeg :  
   👉 [**Télécharger FFmpeg (ZIP)**](https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip) *(Essentials Build)*.
2. Ouvrez le fichier ZIP téléchargé.
3. Naviguez dans le dossier **`bin/`** du ZIP et copiez le fichier **`ffmpeg.exe`**.
4. Collez ce fichier **`ffmpeg.exe`** directement à la racine du dossier de ce logiciel (au même endroit que `lancer.bat` et `app.py`).
5. Actualisez la page dans votre navigateur : l'avertissement disparaît et les options de traitement vidéo sont activées !

---

## 📁 Structure du projet

* `lancer.bat` : Fichier de lancement sous Windows.
* `app.py` : Serveur local Flask (logique de traitement et sélection native de fichiers Windows).
* `requirements.txt` : Liste des bibliothèques nécessaires.
* `test_app.py` : Tests unitaires automatisés.
* `templates/index.html` : Interface web (HTML).
* `static/css/style.css` : Feuille de style (mode sombre & design moderne).
* `static/js/main.js` : Logique d'interactivité et de mise à jour en direct de la console.
* `venv/` : Environnement virtuel Python (créé automatiquement).
