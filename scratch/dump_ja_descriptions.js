import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const songs = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'songs.json'), 'utf8'));
const lines = songs.map((s, idx) => `${idx + 1}. [${s.name}] (ID: ${s.youtube_id}) -> ${s.description ? s.description.ja : ''}`).join('\n');
fs.writeFileSync(path.join(__dirname, '..', 'scratch', 'all_ja_desc.txt'), lines, 'utf8');
console.log('Descriptions dumped!');
