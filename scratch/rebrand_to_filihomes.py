import os
import re

# Paths to process
ROOT_DIR = "/Users/chriskim/Documents/FiliHomes"

# Excluded directories and file patterns
EXCLUDE_DIRS = {".git", "node_modules", ".next", ".expo", ".vercel", "dist", "ScreenShots", ".temp", ".claude"}
EXCLUDE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".zip", ".mp3", ".mp4", ".bak", ".db"}

# Replacement rules
REPLACEMENTS = [
    # Core Branding
    ("FiliHomes", "FiliHomes"),
    ("filihomes", "filihomes"),
    ("FILIHOMES", "FILIHOMES"),
    ("Fili Homes", "Fili Homes"),
    
    # App Identity
    ("com.filihomes.app", "com.filihomes.app"),
    
    # Email / Domain
    ("support@filihomes.com", "support@filihomes.com"),
    ("investment@filihomes.com", "investment@filihomes.com"),
    ("filihomes.com", "filihomes.com"),
    ("fili-homes-db", "fili-homes-db"),
    ("filihomes_bank_feed", "filihomes_bank_feed"),
    ("filihomes_occupant_requests", "filihomes_occupant_requests"),
    ("filihomes_platform_issues", "filihomes_platform_issues"),
    ("filihomes_subscription_payments", "filihomes_subscription_payments"),
    ("filihomes_subscription_contracts", "filihomes_subscription_contracts"),
    ("filihomes_hq_staff", "filihomes_hq_staff"),
    
    # Terminology Adaptation (Condo -> Village/Subdivision)
    ("Homeowners Association (HOA)", "Homeowners Association (HOA)"),
    ("HOA Board", "HOA Board"),
    ("homeowners association", "homeowners association"),
    ("Homeowners Association", "Homeowners Association"),
    ("house/lot", "house/lot"),
    ("house/lots", "houses/lots"),
    ("House/Lot", "House/Lot"),
    ("House/Lots", "Houses/Lots"),
    ("Village/Subdivision", "Village/Subdivision"),
    ("village/subdivision", "village/subdivision"),
    ("Village/Subdivisions", "Villages/Subdivisions"),
    ("village/subdivisions", "villages/subdivisions"),
    ("Village Settings", "Village Settings"),
    
    # Block/Phase -> Phase/Block
    ("Phase/Block", "Phase/Block"),
    ("phase/block", "phase/block"),
    ("Block/Phase", "Block/Phase"),
    ("block_phase_no", "block_phase_no"),
    
    # Unit -> House/Lot (User-facing only, we avoid breaking database table and column names)
    # Note: We replace the display text "House/Lot No" / "House/Lot Number" with "House/Lot No"
    ("House/Lot Number", "House/Lot Number"),
    ("house/lot number", "house/lot number"),
    ("House/Lot No", "House/Lot No"),
    ("house/lot no", "house/lot no"),
]

def rebrand_file(filepath):
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
        
        original_content = content
        
        # Apply replacements
        for old, new in REPLACEMENTS:
            content = content.replace(old, new)
            
        # Specific pricing model replacement in SubscriptionBillingManager.tsx and SuperAdminManager.tsx
        if "SubscriptionBillingManager.tsx" in filepath:
            # Update default license fee amount to reflect new model description
            content = content.replace(
                "const [amount, setAmount] = useState<number>(25000); // Default flat fee",
                "const [amount, setAmount] = useState<number>(4000); // Default fee (e.g., 200 households * 20 PHP)"
            )
            content = content.replace(
                "Pay your monthly FiliHomes software licensing fees, submit transfer receipts, and review billing statements.",
                "Pay your monthly FiliHomes software licensing fees (PHP 20 per household/month), submit transfer receipts, and review billing statements."
            )
            content = content.replace(
                "Banco de Oro (BDO) | FiliHomes Technologies Inc.",
                "Banco de Oro (BDO) | FiliHomes Technologies Inc."
            )
        
        if "SuperAdminManager.tsx" in filepath:
            content = content.replace(
                "hourly_rate: 350, // default hourly rate behind the scenes",
                "hourly_rate: 350, // default hourly rate"
            )
            # Rebrand billing contract creation UI hints
            content = content.replace(
                "placeholder=\"e.g. 5000\"",
                "placeholder=\"e.g. 4000 (PHP 20/unit)\""
            )
            
        if original_content != content:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Rebranded: {filepath}")
            
    except Exception as e:
        print(f"Error processing {filepath}: {e}")

def walk_and_rebrand():
    for root, dirs, files in os.walk(ROOT_DIR):
        # Prune excluded directories in-place
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in EXCLUDE_EXTS:
                continue
                
            filepath = os.path.join(root, file)
            rebrand_file(filepath)
            
    # Rename files/folders containing FiliHomes/filihomes in their name
    rename_files()

def rename_files():
    for root, dirs, files in os.walk(ROOT_DIR, topdown=False):
        # We process files first
        for file in files:
            if "FiliHomes" in file or "filihomes" in file:
                old_path = os.path.join(root, file)
                new_file = file.replace("FiliHomes", "FiliHomes").replace("filihomes", "filihomes")
                new_path = os.path.join(root, new_file)
                try:
                    os.rename(old_path, new_path)
                    print(f"Renamed file: {old_path} -> {new_path}")
                except Exception as e:
                    print(f"Error renaming file {old_path}: {e}")
                    
        # Then we process directories
        for d in dirs:
            if "FiliHomes" in d or "filihomes" in d:
                old_path = os.path.join(root, d)
                new_dir = d.replace("FiliHomes", "FiliHomes").replace("filihomes", "filihomes")
                new_path = os.path.join(root, new_dir)
                try:
                    os.rename(old_path, new_path)
                    print(f"Renamed directory: {old_path} -> {new_path}")
                except Exception as e:
                    print(f"Error renaming directory {old_path}: {e}")

if __name__ == "__main__":
    print("Starting rebranding process...")
    walk_and_rebrand()
    print("Rebranding process completed!")
