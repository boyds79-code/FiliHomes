const { Client } = require('pg');

const regions = [
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-northeast-3',
  'ap-south-1',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-central-1',
  'eu-north-1',
  'me-central-1',
  'sa-east-1'
];

const passwords = [
  'SoleaResidences',
  'FiliHomes123',
  'filihomes',
  'password123',
  'postgres',
  'admin123'
];

const projectRef = 'asqgyncyqnbmitkubjwq';

async function testAll() {
  for (const region of regions) {
    const host = `aws-0-${region}.pooler.supabase.com`;
    console.log(`Checking region ${region} (${host})...`);
    
    // We can do a quick connection check
    for (const password of passwords) {
      const client = new Client({
        host,
        port: 6543,
        database: 'postgres',
        user: `postgres.${projectRef}`,
        password,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 3000
      });

      try {
        await client.connect();
        console.log(`\n🎉 CONNECTION SUCCESS IN REGION: ${region}`);
        console.log(`Host: ${host}`);
        console.log(`Password: ${password}`);
        await client.end();
        return;
      } catch (err) {
        if (err.message.includes('password authentication failed') || err.message.includes('authentication failed')) {
          console.log(`Region found! ${region} (Password incorrect: "${password}")`);
        } else {
          // If it's tenant not found, we just break to next region to save time
          if (err.message.includes('tenant/user') && err.message.includes('not found')) {
            // Tenant not found in this region
            break;
          }
          console.log(`Error in ${region} with ${password}: ${err.message}`);
        }
      }
    }
  }
}

testAll();
