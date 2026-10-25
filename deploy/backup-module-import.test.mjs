import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {spawn} from 'node:child_process';
const run=promisify(execFile);
const moduleUrls=['./media-backup.mjs','./paired-backup.mjs'].map(name=>new URL(name,import.meta.url).href);
for(const url of moduleUrls){
 test(`${url.split('/').at(-1)} imports from stdin without interpreting '-' as a file`,async()=>{
  const result=await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['--input-type=module','-'],{stdio:['pipe','pipe','pipe']});let out='',err='';
   child.stdout.on('data',v=>out+=v);child.stderr.on('data',v=>err+=v);child.on('error',reject);child.on('close',code=>resolve({code,out,err}));
   child.stdin.end(`const module=await import(${JSON.stringify(url)}); console.log(typeof module.${url.includes('paired-')?'verifyPair':'verifyMediaBackup'});`);
  });
  assert.equal(result.code,0,result.err);assert.equal(result.out.trim(),'function');
 });
 test(`${url.split('/').at(-1)} imports with an ordinary nonexistent script argument`,async()=>{
  const result=await run(process.execPath,['--input-type=module','-e',`const module=await import(${JSON.stringify(url)});console.log(typeof module.${url.includes('paired-')?'verifyPair':'verifyMediaBackup'});`,'not-a-file']);
  assert.equal(result.stdout.trim(),'function');
 });
}
