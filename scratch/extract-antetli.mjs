import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const src = path.join('c:/Users/DELL/Desktop', 'Kibritçi antetli.docx');
const zip = 'c:/Users/DELL/Desktop/kibritci_antetli.zip';
const out = 'c:/Users/DELL/Desktop/kibritci_antetli_extract';

fs.copyFileSync(src, zip);
execSync(
  `powershell -NoProfile -Command "Expand-Archive -LiteralPath '${zip}' -DestinationPath '${out}' -Force"`,
  { stdio: 'inherit' }
);

for (const rel of ['word/document.xml', 'word/header1.xml', 'word/footer1.xml']) {
  const p = path.join(out, rel);
  if (fs.existsSync(p)) {
    console.log('\n===', rel, '===');
    console.log(fs.readFileSync(p, 'utf8').slice(0, 8000));
  }
}

const mediaDir = path.join(out, 'word/media');
if (fs.existsSync(mediaDir)) {
  console.log('\n=== media ===');
  console.log(fs.readdirSync(mediaDir));
}
