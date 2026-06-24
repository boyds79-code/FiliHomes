import { createClient } from '@supabase/supabase-js';

// Force Node.js to prioritize IPv4 DNS resolution to avoid getaddrinfo ENOTFOUND on macOS/Node.js
if (typeof window === 'undefined') {
  try {
    const dns = require('dns');
    if (dns && typeof dns.setDefaultResultOrder === 'function') {
      dns.setDefaultResultOrder('ipv4first');
    }
  } catch (e) {
    console.warn("Failed to set DNS result order:", e);
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://asqgyncyqnbmitkubjwq.supabase.co';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ'; // 반드시 서비스 롤 키 사용

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);