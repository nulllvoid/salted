import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
const privateValues = ['SUPA_JWT','SUPABASE_DB_PASSWORD','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ACCESS_TOKEN']
  .map(key => ({ key, value: process.env[key] })).filter(item => item.value && item.value.length >= 8);
let checked = 0;
function scan(directory) {
  for (const entry of readdirSync(directory,{withFileTypes:true})) {
    const path = join(directory,entry.name);
    if (entry.isDirectory()) scan(path);
    else {
      const content = readFileSync(path); checked++;
      for (const { key, value } of privateValues) if (content.includes(Buffer.from(value))) throw new Error(`Private configuration ${key} found in build output`);
    }
  }
}
scan('app/dist');
console.log(`Checked ${checked} exported files: no configured private credentials found.`);
