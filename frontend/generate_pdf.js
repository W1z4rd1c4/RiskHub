import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const htmlPath = path.resolve(__dirname, '..', 'presentation.html');
const pdfPath = path.resolve(__dirname, '..', 'presentation.pdf');

console.log(`Loading HTML from: ${htmlPath}`);

const browser = await chromium.launch();
const page = await browser.newPage();

// Force screen media to capture dark mode exactly as seen in browser
await page.emulateMedia({ media: 'screen' });

// Load the HTML file
await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

// Wait for images to settle
await page.waitForTimeout(2000);

// Generate PDF with high quality settings
await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: {
        top: '20px',
        right: '20px',
        bottom: '20px',
        left: '20px'
    },
    scale: 0.8,
    preferCSSPageSize: false
});

await browser.close();

const stats = fs.statSync(pdfPath);
console.log(`PDF generated successfully: ${pdfPath}`);
console.log(`File size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
