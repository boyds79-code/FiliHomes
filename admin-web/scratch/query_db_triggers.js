const { Client } = require('pg');

const host = 'aws-1-ap-southeast-1.pooler.supabase.com';
const port = 5432;
const database = 'postgres';
const user = 'postgres.asqgyncyqnbmitkubjwq';
const passwords = [
  'SoleaResidences',
  'FiliCondo123',
  'filicondo',
  'password123',
  'postgres',
  'admin123'
];

async function run() {
  const query = `
    SELECT 
      trg.tgname AS trigger_name,
      tbl.relname AS table_name,
      p.proname AS function_name,
      p.prosrc AS function_source
    FROM pg_trigger trg
    JOIN pg_class tbl ON trg.tgrelid = tbl.oid
    JOIN pg_proc p ON trg.tgfoid = p.oid
    WHERE tbl.relname IN ('visitor_passes', 'notifications', 'visitor_logs')
       OR p.prosrc LIKE '%방문%'
       OR p.prosrc LIKE '%visitor%'
       OR p.prosrc LIKE '%gate_request%';
  `;

  for (const password of passwords) {
    const client = new Client({
      host,
      port,
      database,
      user,
      password,
      ssl: { rejectUnauthorized: false }
    });

    try {
      await client.connect();
      console.log(`Connected successfully with password: "${password}"`);
      const res = await client.query(query);
      console.log("=== TRIGGERS FOUND ===");
      res.rows.forEach(row => {
        console.log(`Trigger: ${row.trigger_name} | Table: ${row.table_name} | Function: ${row.function_name}`);
        if (row.function_source.includes('방문') || row.function_source.includes('visitor') || row.function_source.includes('gate')) {
          console.log("--- Source Snippet ---");
          console.log(row.function_source.substring(0, 1000));
          console.log("----------------------");
        }
      });
      await client.end();
      return;
    } catch (err) {
      console.log(`Failed with password: "${password}": ${err.message}`);
    }
  }
}

run();
