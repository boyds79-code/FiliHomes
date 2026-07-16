import os
import shutil

src = "/Users/chriskim/Documents/FiliCondo"
dst = "/Users/chriskim/Documents/FiliHomes"

# Exclude directories from copy
ignore_patterns = shutil.ignore_patterns(
    "node_modules", ".next", ".expo", ".vercel", ".temp", "dist"
)

def copy_project():
    if not os.path.exists(dst):
        os.makedirs(dst)
    
    print(f"Copying project from {src} to {dst}...")
    
    for item in os.listdir(src):
        s = os.path.join(src, item)
        d = os.path.join(dst, item)
        
        # Check if item should be ignored
        ignored_names = ignore_patterns(src, [item])
        if item in ignored_names:
            print(f"Skipping: {item}")
            continue
            
        try:
            if os.path.isdir(s):
                if os.path.exists(d):
                    shutil.rmtree(d)
                shutil.copytree(s, d, ignore=ignore_patterns)
                print(f"Copied directory: {item}")
            else:
                shutil.copy2(s, d)
                print(f"Copied file: {item}")
        except Exception as e:
            print(f"Error copying {item}: {e}")

if __name__ == "__main__":
    copy_project()
    print("Project copy completed successfully!")
