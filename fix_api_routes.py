import os
import re

api_files = [
    "src/app/api/approve-payment/route.ts",
    "src/app/api/approve-receipt/route.ts",
    "src/app/api/billings/route.ts",
    "src/app/api/pending-receipts/route.ts",
    "src/app/api/upload-billings/route.ts"
]

base_dir = "/Users/chriskim/Documents/FiliCondo/admin-web"

for relative_path in api_files:
    file_path = os.path.join(base_dir, relative_path)
    if not os.path.exists(file_path):
        print(f"Skipping {relative_path}, not found.")
        continue
    
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Common replacement
    new_import = "import { getAdminClient } from '../../../lib/supabaseServer';"
    
    if "approve-payment/route.ts" in relative_path:
        content = content.replace("import { createClient } from '@supabase/supabase-js';", new_import)
        content = re.sub(r"const adminClient = createClient\(\s*process\.env\.NEXT_PUBLIC_SUPABASE_URL!,\s*process\.env\.SUPABASE_SERVICE_ROLE_KEY!\s*\);", 
                         "const adminClient = getAdminClient();", content)

    elif "billings/route.ts" in relative_path:
        content = content.replace("import { createClient } from '@supabase/supabase-js';", new_import)
        content = re.sub(r"const supabaseAdmin = createClient\(\s*process\.env\.NEXT_PUBLIC_SUPABASE_URL!,\s*process\.env\.SUPABASE_SERVICE_ROLE_KEY!\s*\);", 
                         "const supabaseAdmin = getAdminClient();", content)

    else:
        # pending-receipts, approve-receipt, upload-billings
        content = re.sub(r"import\s+\{\s*supabaseAdmin\s*\}\s+from\s+['\"]\.\./\.\./\.\./\.\./lib/Adminsupabase['\"];?", 
                         new_import + "\nconst supabaseAdmin = getAdminClient();", content)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"Updated {relative_path}")

