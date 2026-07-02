const https = require('https');

const url = "https://asqgyncyqnbmitkubjwq.supabase.co/rest/v1/rpc/exec_sql";
const serviceRoleKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFzcWd5bmN5cW5ibWl0a3ViandxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI2NTM5MiwiZXhwIjoyMDk0ODQxMzkyfQ.mK36GfwqVE4LrDAuIGvVDd6Bpy6vj6gdvPnw-RmjSHQ";

const sql = `
  SELECT 
    trg.tgname AS trigger_name,
    tbl.relname AS table_name,
    p.proname AS function_name,
    p.prosrc AS function_source
  FROM pg_trigger trg
  JOIN pg_class tbl ON trg.tgrelid = tbl.oid
  JOIN pg_proc p ON trg.tgfoid = p.oid
  WHERE tbl.relname = 'visitor_passes';
`;

const data = JSON.stringify({ sql });

const options = {
  method: 'POST',
  headers: {
    'apikey': serviceRoleKey,
    'Authorization': `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(url, options, (res) => {
  let body = '';
  res.on('data', (chunk) => body += chunk);
  res.on('end', () => {
    console.log("Status Code:", res.statusCode);
    try {
      const parsed = JSON.parse(body);
      console.log("=== TRIGGERS FOUND ===");
      console.log(JSON.stringify(parsed, null, 2));
    } catch (e) {
      console.log("Raw Response:", body);
    }
  });
});

req.on('error', (e) => {
  console.error("Error:", e);
});

req.write(data);
req.end();
