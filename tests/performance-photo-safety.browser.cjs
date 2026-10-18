const {chromium}=require('playwright');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const output=fs.mkdtempSync(path.join(os.tmpdir(),'cmanager-photo-safety-'));
const imageFile=path.join(output,'image.png');
const base=process.env.CMANAGER_TEST_URL||'http://127.0.0.1:8010';
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{const page=await browser.newPage({serviceWorkers:'block'});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent('<p>Safety test image</p>');await page.screenshot({path:imageFile});await page.goto(base);await page.evaluate(()=>{db.cards=[{id:'test',name:'안전성 테스트',target:300000,benefitLimit:10000}];manualRecords={'test|2026-10':{eligible:10000}};render();window.Tesseract={createWorker:async()=>({setParameters:async()=>{},terminate:async()=>{},recognize:async()=>{if(window.testPhotoError)throw Error('test error');if(window.testPhotoPending)await new Promise(r=>window.testPhotoResolve=r);return{data:{text:window.testPhotoText}}}})}});
async function open(text){await page.evaluate(text=>{window.testPhotoText=text;cardDetail('test','2026-10')},text);await page.locator('[data-photo-file]').setInputFiles(imageFile)}
await open('합산기간 11.1 ~ 11.30\n현재 실적\n103,316원');await page.locator('[data-photo-result]').waitFor({state:'visible'});assert.equal(await page.locator('[data-photo-review]').isVisible(),false);assert.equal(await page.evaluate(()=>manualRecords['test|2026-10'].eligible),10000);
// The visible action opens the native picker in the original user click handler.
const picker=page.waitForEvent('filechooser');await page.locator('[data-photo-open]').click();await picker;
// Cancelling a photo leaves both an unsaved manual edit and stored data alone.
await open('현재 실적\n103,316원');await page.locator('[data-photo-result]').waitFor({state:'visible'});
assert.equal(await page.locator('[data-photo-confirm]').count(),0);
await page.locator('[name=eligible]').fill('20000');
await page.locator('[data-photo-cancel]').click();
assert.equal(await page.locator('[name=eligible]').inputValue(),'20,000');
assert.equal(await page.locator('[data-photo-content]').isVisible(),false);
assert.equal(await page.evaluate(()=>manualRecords['test|2026-10'].eligible),10000);
// Selecting an amount saves through the original handler; no second save is needed.
await open('현재 실적\n103,316원');await page.locator('[data-photo-result]').waitFor({state:'visible'});
await page.locator('[data-photo-candidates] button').click();
assert.equal(await page.locator('[name=eligible]').inputValue(),'103,316');
assert.equal(await page.evaluate(()=>manualRecords['test|2026-10'].eligible),103316);
assert.equal(await page.locator('[data-photo-content]').isVisible(),false);
await page.evaluate(()=>{manualRecords['test|2026-10'].eligible=10000;closeSheet()});
// Reopening a card resets the actual scrolling sheet, not just its inner body.
await page.evaluate(()=>{cardDetail('test','2026-10');sheet.scrollTop=500});
assert.ok(await page.evaluate(()=>sheet.scrollTop)>0);
await page.evaluate(()=>{closeSheet();cardDetail('test','2026-10')});assert.equal(await page.evaluate(()=>sheet.scrollTop),0);
await page.evaluate(()=>window.testPhotoError=true);await open('');await page.locator('[data-photo-status]').filter({hasText:'사진을 읽지 못했습니다'}).waitFor();assert.equal(await page.evaluate(()=>manualRecords['test|2026-10'].eligible),10000);
await page.evaluate(()=>{window.testPhotoError=false;window.testPhotoPending=true});await open('현재 실적\n999999원');await page.waitForFunction(()=>!!window.testPhotoResolve);await page.locator('[data-photo-cancel]').click();await page.evaluate(()=>window.testPhotoResolve());await page.waitForTimeout(100);assert.equal(await page.locator('[name=eligible]').inputValue(),'10,000');assert.equal(await page.locator('[data-photo-content]').isVisible(),false);assert.equal(await page.evaluate(()=>manualRecords['test|2026-10'].eligible),10000);assert.deepEqual(errors,[]);
console.log('PASS: immediate picker; one-click save; cancellation preserves stored data and manual edits; sheet opens at top; month mismatch and failures write nothing; cancelled OCR cannot refill draft.');}finally{await browser.close();fs.rmSync(output,{recursive:true,force:true})}})().catch(e=>{console.error(e);process.exit(1)});
