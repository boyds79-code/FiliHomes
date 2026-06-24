import os

file_path = "/Users/chriskim/Documents/FiliCondo/admin-web/src/app/api/upload-billings/route.ts"
with open(file_path, 'r') as f:
    content = f.read()

content = content.replace("import { supabaseAdmin } from '../../../../lib/Adminsupabase';", "import { getAdminClient } from '../../../lib/supabaseServer';\nconst supabaseAdmin = getAdminClient();")

with open(file_path, 'w') as f:
    f.write(content)
