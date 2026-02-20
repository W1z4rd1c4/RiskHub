const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
    const htmlPath = path.resolve(__dirname, 'presentation.html');
    const pdfPath = path.resolve(__dirname, 'placeholder-presentation-output.pdf');

    console.log(`Loading HTML from: ${htmlPath}`);

    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Load the HTML file
    await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle' });

    // Wait for fonts and images to fully load
    await page.waitForTimeout(3000);

    // Generate PDF with high quality settings
    await placeholder-pdf-033.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: {
            top: '20px',
            right: '20px',
            bottom: '20px',
            left: '20px'
        },
        scale: 0.75,
        preferCSSPageSize: false
    });

    await browser.close();

    const stats = fs.statSync(pdfPath);
    console.log(`PDF generated successfully: ${pdfPath}`);
    console.log(`File size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB`);
})();
