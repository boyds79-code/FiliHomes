import os
import re

files_to_update = [
    "components/admin/StaffManager.tsx",
    "components/CondoSettings.tsx",
    "components/DataMigrator.tsx",
    "components/MaintenanceJobOrderManager.tsx",
    "components/ParcelManager.tsx",
    "components/RealtimeIntercomMatrix.tsx",
    "components/SecuritySanctionManager.tsx",
    "components/StaffPayrollManager.tsx",
    "components/VehicleRegistryManager.tsx",
    "components/BillingManager.tsx" # Include BillingManager just in case
]

base_dir = "/Users/chriskim/Documents/FiliHomes/admin-web"

for relative_path in files_to_update:
    file_path = os.path.join(base_dir, relative_path)
    if not os.path.exists(file_path):
        print(f"Skipping {relative_path}, not found.")
        continue
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Replace the import statement
    if "admin/StaffManager.tsx" in relative_path:
        new_import = "import { supabase } from '../../src/lib/supabaseClient';"
    else:
        new_import = "import { supabase } from '../src/lib/supabaseClient';"
    
    # We want to replace matching old imports:
    # import { supabaseAdmin } from '../lib/Adminsupabase';
    # import { supabaseAdmin } from '../../lib/Adminsupabase';
    content = re.sub(r"import\s+\{\s*supabaseAdmin\s*\}\s+from\s+['\"]\.\./lib/Adminsupabase['\"];?", new_import, content)
    content = re.sub(r"import\s+\{\s*supabaseAdmin\s*\}\s+from\s+['\"]\.\./\.\./lib/Adminsupabase['\"];?(.*)", new_import + r"\1", content)
    
    # Also fix BillingManager.tsx if it has a wrong import
    content = re.sub(r"import\s+\{\s*supabase\s*\}\s+from\s+['\"]\.\./src/lib/supabaseClient['\"];?", new_import, content)

    # Now replace all usages of supabaseAdmin with supabase
    content = re.sub(r"\bsupabaseAdmin\b", "supabase", content)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Updated {relative_path}")

