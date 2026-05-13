const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
  connectionString: 'postgresql://postgres:HcewbThOBNqVRgvBTgPyHumCIAoOUIkh@turntable.proxy.rlwy.net:14220/railway',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  const sql = fs.readFileSync('supabase/migration_v3.sql', 'utf8');
  await client.query(sql);
  console.log('Migration v3 done!');
  await client.end();
}

run().catch(e => { console.error(e.message); client.end(); });