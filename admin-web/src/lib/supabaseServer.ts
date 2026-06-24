// [admin-web/lib/supabaseServer.ts]
import { createClient } from '@supabase/supabase-js';
import dns from 'dns';

// Force Node.js to prioritize IPv4 DNS resolution to avoid getaddrinfo ENOTFOUND on macOS/Node.js
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

// 이 함수를 호출할 때마다 서버용 클라이언트를 만들어줍니다.
export const getAdminClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://asqgyncyqnbmitkubjwq.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ';
  return createClient(url, serviceRoleKey);
};
