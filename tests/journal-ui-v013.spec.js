import {test,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createAccountApi} from '../server/account-api.mjs';
import {viteClientShim} from './vite-client-shim.js';

let backend,origin,directory,api;
test.beforeEach(async()=>{
 directory=await mkdtemp(join(tmpdir(),'form-ui-accounts-'));api=await createAccountApi({dataDir:directory,rateLimit:false});backend=createServer((req,res)=>{api.handler(req,res).catch(()=>{res.writeHead(500);res.end();});});await new Promise(done=>backend.listen(0,'127.0.0.1',done));origin=`http://127.0.0.1:${backend.address().port}`;
});
test.afterEach(async()=>{await new Promise(done=>backend.close(done));await api.flush();if(!resolve(directory).startsWith(resolve(tmpdir())+ '\\form-ui-accounts-')&&!resolve(directory).startsWith(resolve(tmpdir())+'/form-ui-accounts-'))throw Error('unexpected test directory');await rm(directory,{recursive:true,force:true});});
async function boot(page,{existing=false}={}){
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.addInitScript(existing=>{window.requestAnimationFrame=()=>0;if(existing){localStorage.setItem('form.exercise-progress.v1',JSON.stringify(['dumbbell-curl']));localStorage.setItem('form.learned',JSON.stringify(['dumbbell-curl']));localStorage.setItem('form.training-profile.v1',JSON.stringify({minutes:45}));}},existing);
 await page.route('**/@vite/client',route=>route.fulfill({body:viteClientShim,contentType:'text/javascript'}));
 await page.route('**/api/form/v1/**',async route=>{const request=route.request(),path=new URL(request.url()).pathname,headers={Origin:origin,'Content-Type':'application/json',...(request.headers().cookie?{Cookie:request.headers().cookie}:{})},response=await fetch(origin+path,{method:request.method(),headers,body:['GET','HEAD'].includes(request.method())?undefined:request.postData()}),body=Buffer.from(await response.arrayBuffer()),replyHeaders={'Content-Type':'application/json',...(response.headers.get('set-cookie')?{'Set-Cookie':response.headers.get('set-cookie')}:{})};await route.fulfill({status:response.status,headers:replyHeaders,body});});
 await page.goto('/');await page.waitForFunction(()=>window.__FORM__?.state.loaded,null,{timeout:120000,polling:100});await page.evaluate(()=>window.__FORM__.journal.ready);await page.locator('[data-action=free]').click();return errors;
}
async function record(page,notes='實際訓練'){
 await page.locator('[data-action=journal]').click();const dialog=page.locator('.training-journal-dialog');await dialog.locator('select[name=exerciseId]').selectOption('dumbbell-curl');await dialog.locator('[data-set-field=weightKg]').fill('8');await dialog.locator('[data-set-field=reps]').fill('10');await dialog.locator('[data-set-field=effort]').selectOption('6');await dialog.locator('textarea[name=notes]').fill(notes);await dialog.getByRole('button',{name:'儲存這次訓練',exact:true}).click();await expect(dialog.locator('.journal-record')).toHaveCount(1);return dialog;
}
test('日誌保留既有學習資料；新增、編輯、備份、刪除與合併匯入能實際操作',async({page})=>{
 const errors=await boot(page,{existing:true});expect(await page.evaluate(()=>[...window.__FORM__.state.learned])).toContain('dumbbell-curl');expect(await page.evaluate(()=>window.__FORM__.state.trainingProfile.minutes)).toBe(45);expect(await page.evaluate(()=>window.__FORM__.journal.getDiagnostics().entries)).toBe(0);
 const dialog=await record(page,'<img src=x onerror=alert(1)> 實際完成');await expect(dialog.locator('.journal-record')).toContainText('10 下');await expect(dialog.locator('.journal-record img')).toHaveCount(0);
 await dialog.locator('[data-edit-entry]').click();await dialog.locator('[data-copy-set]').click();await dialog.locator('[data-set-field=reps]').nth(1).fill('12');await dialog.getByRole('button',{name:'儲存修改',exact:true}).click();await expect(dialog.locator('.journal-record li')).toHaveCount(2);
 const downloading=page.waitForEvent('download');await dialog.locator('[data-journal-action=export-json]').click();const downloaded=await downloading,text=await readFile(await downloaded.path(),'utf8'),backup=JSON.parse(text);expect(backup.entries).toHaveLength(1);expect(backup.learned).toContain('dumbbell-curl');
 await dialog.locator('[data-delete-entry]').click();await dialog.locator('[data-confirm-delete]').click();await expect(dialog.locator('.journal-record')).toHaveCount(0);await dialog.locator('[data-journal-import]').setInputFiles({name:'training-backup.json',mimeType:'application/json',buffer:Buffer.from(text)});await expect(dialog.locator('.journal-record')).toHaveCount(1);await expect(dialog.locator('.journal-record li')).toHaveCount(2);expect(await page.evaluate(()=>[...window.__FORM__.state.learned])).toContain('dumbbell-curl');
 await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();expect(errors).toEqual([]);
});
test('帳號可在兩個獨立瀏覽器 context 同步，登入不會自動混入訪客紀錄',async({page,browser})=>{
 const errors=await boot(page),dialog=await record(page);await dialog.getByRole('button',{name:'帳號與同步',exact:true}).click();await dialog.locator('[data-journal-action=auth-register]').click();await dialog.locator('input[name=username]').fill('member_ui');await dialog.locator('input[name=password]').fill('sample-password-123');await dialog.locator('input[name=displayName]').fill('會員一');await dialog.locator('[data-journal-form=auth] button[type=submit]').click();await expect(dialog.locator('.journal-account h3')).toHaveText('會員一');expect(await page.evaluate(()=>window.__FORM__.journal.getDiagnostics().entries)).toBe(0);
 await dialog.locator('[data-journal-action=import-guest]').click();await dialog.locator('[data-journal-action=sync]').first().click();await expect(dialog.locator('.journal-status')).toHaveText('已同步');
 const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:.5}),second=await context.newPage();try{
  const secondErrors=await boot(second);await second.locator('[data-action=account]').click();const other=second.locator('.training-journal-dialog');await other.locator('input[name=username]').fill('member_ui');await other.locator('input[name=password]').fill('sample-password-123');await other.locator('[data-journal-form=auth] button[type=submit]').click();await expect(other.locator('.journal-account h3')).toHaveText('會員一');expect(await second.evaluate(()=>window.__FORM__.journal.getDiagnostics().entries)).toBe(1);
  await other.locator('[data-journal-action=tab-journal]').click();await other.locator('[data-edit-entry]').click();await other.locator('textarea[name=notes]').fill('第二個裝置補記');await other.getByRole('button',{name:'儲存修改',exact:true}).click();await other.locator('[data-journal-action=sync]').first().click();await expect(other.locator('.journal-status')).toHaveText('已同步');await dialog.locator('[data-journal-action=sync]').first().click();await expect(dialog.locator('.journal-status')).toHaveText('已同步');await dialog.locator('[data-journal-action=tab-journal]').click();await expect(dialog.locator('.journal-record')).toContainText('第二個裝置補記');expect(secondErrors).toEqual([]);
 }finally{await context.close();}expect(errors).toEqual([]);
});
