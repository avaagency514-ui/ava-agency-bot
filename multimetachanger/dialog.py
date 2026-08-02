import sys
import tkinter as tk
from tkinter import filedialog
import ctypes

def steal_focus(window):
    try:
        window.lift()
        window.attributes('-topmost', True)
        window.focus_force()
    except Exception:
        pass

def main():
    if len(sys.argv) < 2:
        return
    mode = sys.argv[1]
    
    root = tk.Tk()
    root.withdraw()
    steal_focus(root)
    
    if mode == 'file':
        path = filedialog.askopenfilename(
            title="Selectionner le fichier source",
            filetypes=[
                ("Multimedias", "*.jpg;*.jpeg;*.png;*.webp;*.mp4;*.mov;*.avi;*.mkv;*.webm"),
                ("Images", "*.jpg;*.jpeg;*.png;*.webp"),
                ("Videos", "*.mp4;*.mov;*.avi;*.mkv;*.webm"),
                ("Tous les fichiers", "*.*")
            ]
        )
        print(path)
    elif mode == 'folder':
        path = filedialog.askdirectory(title="Selectionner le dossier")
        print(path)
    
    root.destroy()

if __name__ == '__main__':
    main()