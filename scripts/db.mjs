// Read configuration through Node's --env-file; never print connection strings.
import pg from 'pg';
import { readFileSync } from 'node:fs';
const connectionString = readFileSync(
  new URL('../supabase/.temp/pooler-url', import.meta.url),
  'utf8',
).trim();
const ca = readFileSync(
  new URL('../supabase/.temp/root.crt', import.meta.url),
  'utf8',
);
const address = new URL(connectionString);
const client = new pg.Client({
  host: address.hostname,
  port: Number(address.port || 5432),
  user: decodeURIComponent(address.username),
  database: address.pathname.slice(1),
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: true, ca },
  connectionTimeoutMillis: 15000,
});
try {
  await client.connect();
  const sql =
    process.argv[2] === '--file'
      ? readFileSync(process.argv[3], 'utf8')
      : process.argv[2];
  if (!sql) throw new Error('Pass a SQL statement or --file path.');
  const result = await client.query(sql);
  for (const item of Array.isArray(result) ? result : [result])
    if (item.rows.length) console.log(JSON.stringify(item.rows));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
