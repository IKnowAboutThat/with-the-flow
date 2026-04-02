const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const htmlPath = path.resolve(__dirname, 'meal-plan-v2.html');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: path.resolve(__dirname, 'output/with-the-flow-v2.pdf'),
    width: '6in',
    height: '9in',
    margin: { top: '0.55in', right: '0.5in', bottom: '0.6in', left: '0.5in' },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: '<div style="width: 100%; text-align: center; font-size: 9px; font-family: Helvetica Neue, Arial, sans-serif; color: #b8a090;">— <span class="pageNumber"></span> —</div>',
  });
  await browser.close();
  console.log('PDF generated: output/with-the-flow-v2.pdf');
})();
