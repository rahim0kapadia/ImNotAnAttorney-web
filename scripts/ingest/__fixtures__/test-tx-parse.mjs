import fs from 'fs';
import pdfParse from 'pdf-parse';

const pdfPath = 'tx-sample-pe-19.pdf';
const pdfBuffer = fs.readFileSync(pdfPath);

pdfParse(pdfBuffer).then(data => {
  const text = data.text;
  console.log('PDF extracted text (first 1500 chars):');
  console.log(text.slice(0, 1500));
  console.log('\n--- Section marker check ---\n');
  
  const lines = text.split('\n');
  let sectionCount = 0;
  lines.forEach((line, idx) => {
    if (/^Sec\.\s+\d+\.\d+/.test(line)) {
      sectionCount++;
      if (sectionCount <= 5) console.log(`Sec${sectionCount}: ${line.slice(0, 120)}`);
    }
  });
  console.log(`\nTotal sections found: ${sectionCount}`);
}).catch(err => {
  console.error('Parse error:', err.message);
  process.exit(1);
});
