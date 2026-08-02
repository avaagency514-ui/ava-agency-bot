import sys
import unittest
from datetime import datetime

# Importer les fonctions depuis app.py
try:
    from app import (
        generate_random_exif, 
        dms_from_decimal, 
        strip_ai_metadata, 
        modify_image_hash, 
        modify_image_exif
    )
    IMPORT_OK = True
    IMPORT_ERROR = None
except ImportError as e:
    IMPORT_OK = False
    IMPORT_ERROR = e

class TestMultiMetaChanger(unittest.TestCase):
    def test_imports(self):
        self.assertTrue(IMPORT_OK, f"Erreur d'import : {IMPORT_ERROR}")

    def test_generate_random_exif(self):
        if not IMPORT_OK:
            self.skipTest("Les imports ont échoué")
        meta = generate_random_exif()
        self.assertIn("make", meta)
        self.assertIn("model", meta)
        self.assertIn("software", meta)
        self.assertIn("datetime", meta)
        self.assertIsInstance(meta["datetime"], datetime)
        self.assertIn("gps_lat", meta)
        self.assertIn("gps_lon", meta)
        self.assertIn("gps_city", meta)

    def test_dms_from_decimal(self):
        if not IMPORT_OK:
            self.skipTest("Les imports ont échoué")
        dms = dms_from_decimal(48.8566)
        self.assertEqual(len(dms), 3)
        self.assertEqual(dms[0], (48, 1))
        self.assertEqual(dms[1], (51, 1))
        # secondes = (48.8566 - 48)*60 = 51.396 -> (51.396 - 51)*60 = 23.76
        self.assertGreaterEqual(dms[2][0], 0)

    def test_image_processing(self):
        if not IMPORT_OK:
            self.skipTest("Les imports ont échoué")
        
        import os
        from PIL import Image
        
        # 1. Créer une image de test temporaire (10x10 rouge)
        img_path = "test_temp_orig.png"
        img = Image.new("RGB", (10, 10), color="red")
        img.save(img_path, format="PNG")
        
        try:
            # 2. Tester le nettoyage IA
            clean_path = "test_temp_clean.png"
            ok, msg = strip_ai_metadata(img_path, clean_path)
            self.assertTrue(ok)
            self.assertTrue(os.path.exists(clean_path))
            
            # 3. Tester le Pixel Magic (Hash)
            hash_path = "test_temp_hash.png"
            ok, res = modify_image_hash(clean_path, hash_path, intensity=0.5)
            self.assertTrue(ok)
            self.assertTrue(os.path.exists(hash_path))
            self.assertNotEqual(res["original_hash"], res["modified_hash"])
            
            # 4. Tester l'EXIF
            exif_path = "test_temp_exif.jpg" # JPG pour tester l'EXIF complet
            # Convertir en RGB et sauvegarder en JPG d'abord
            img.save("test_temp_rgb.jpg", format="JPEG")
            ok, res_exif = modify_image_exif("test_temp_rgb.jpg", exif_path)
            self.assertTrue(ok)
            self.assertTrue(os.path.exists(exif_path))
            self.assertIn("make", res_exif)
            
        finally:
            # Nettoyage des fichiers temporaires
            for p in [img_path, "test_temp_clean.png", "test_temp_hash.png", "test_temp_rgb.jpg", "test_temp_exif.jpg"]:
                if os.path.exists(p):
                    try: os.remove(p)
                    except: pass

if __name__ == "__main__":
    unittest.main()
