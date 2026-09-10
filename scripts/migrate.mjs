import { readFileSync } from 'node:fs';
import pg from 'pg';
const address = new URL(
  readFileSync('supabase/.temp/pooler-url', 'utf8').trim(),
);
const client = new pg.Client({
  host: address.hostname,
  port: Number(address.port),
  user: address.username,
  database: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: {
    rejectUnauthorized: true,
    ca: readFileSync('supabase/.temp/root.crt', 'utf8'),
  },
});
const file = process.argv[2];
const apply = process.argv.includes('--apply');
const version = file.split(/[\\/]/).pop().split('_')[0];
const sql = readFileSync(file, 'utf8')
  .replace(/^begin;\s*/i, '')
  .replace(/commit;\s*$/i, '');
try {
  await client.connect();
  await client.query('begin');
  const applied = await client.query(
    'select version from supabase_migrations.schema_migrations where version=$1',
    [version],
  );
  if (applied.rowCount) throw new Error('Migration already applied.');
  await client.query(sql);
  if (!apply) {
    const result = await client.query(
      readFileSync('supabase/tests/user-facing.sql', 'utf8'),
    );
    for (const item of result)
      if (item.rows?.[0]?.verification) console.log(item.rows[0].verification);
    if (version >= '20260911000000') {
      const integrity = await client.query(
        readFileSync('supabase/tests/meal-integrity.sql', 'utf8'),
      );
      for (const item of integrity)
        if (item.rows?.[0]?.verification)
          console.log(item.rows[0].verification);
    }
    await client.query('rollback');
    console.log('Dry run passed; all changes rolled back.');
  } else {
    await client.query(
      'insert into supabase_migrations.schema_migrations(version,name,statements) values($1,$2,$3)',
      [
        version,
        file
          .split(/[\\/]/)
          .pop()
          .replace(/^\d+_|\.sql$/g, ''),
        [sql],
      ],
    );
    await client.query('commit');
    console.log(`Applied migration ${version}.`);
  }
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
