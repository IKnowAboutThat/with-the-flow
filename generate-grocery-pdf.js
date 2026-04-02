const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const htmlPath = path.resolve(__dirname, 'grocery-lists.html');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: path.resolve(__dirname, 'output/with-the-flow-grocery-lists.pdf'),
    width: '6in',
    height: '9in',
    margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' },
    printBackground: true,
  });
  await browser.close();
  console.log('PDF generated: output/with-the-flow-grocery-lists.pdf');
})();
