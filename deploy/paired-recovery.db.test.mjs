import assert from 'node:assert/strict';
import {test} from 'node:test';
import {PrismaClient} from '@prisma/client';
import {createHash, randomBytes} from 'node:crypto';
import {mkdtemp, mkdir, writeFile, readFile, realpath, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import {backupPair, verifyPair} from './paired-backup.mjs';
import {restoreMediaBackup} from './media-backup.mjs';
import {registerMediaRoutes, prepareMediaForPublication} from '../apps/api/src/admin/media.ts';
import {HttpError} from '../apps/api/src/cart.ts';

const sourceUrl = new URL(process.env.TEST_DATABASE_URL ?? '');
assert.equal(sourceUrl.hostname, '127.0.0.1');
assert.equal(sourceUrl.port, '55439');
assert.equal(sourceUrl.pathname, '/shopmaple_test');
const pgBin = process.env.PG_BIN_DIRECTORY ?? (process.platform === 'darwin' ? '/opt/homebrew/opt/postgresql@17/bin' : '/usr/lib/postgresql/17/bin');
const run = promisify(execFile);
const digest = data => createHash('sha256').update(data).digest('hex');
// The test only restores into a fresh owned database. Never restore over the source.
function pg(command, args) {
  return run(join(pgBin, command), args, {timeout:30000, maxBuffer:1024*1024,
    env:{PATH:process.env.PATH, HOME:process.env.HOME, PGHOST:sourceUrl.hostname,
      PGPORT:sourceUrl.port, PGUSER:decodeURIComponent(sourceUrl.username),
      PGPASSWORD:decodeURIComponent(sourceUrl.password), PGCONNECT_TIMEOUT:'5'}});
}

test('a verified pair restores published and private images, exact content references and hidden orphan bytes', async t => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'shop-pair-recovery-'));
  const source = new PrismaClient({datasources:{db:{url:sourceUrl.href}}});
  const suffix = randomBytes(6).toString('hex');
  const recoveryName = `shopmaple_recovery_test_${suffix}`;
  assert.match(recoveryName, /^shopmaple_recovery_test_[a-f0-9]{12}$/);
  const recoveryUrl = new URL(sourceUrl); recoveryUrl.pathname = '/'+recoveryName;
  let recovery, created = false, adminId;
  const documentId = `pair-recovery-${suffix}`;
  t.after(async () => {
    await recovery?.$disconnect();
    if (created) await pg('dropdb', [recoveryName]);
    if (adminId) {
      await source.shopContentRevision.deleteMany({where:{actorId:adminId}});
      await source.shopContent.deleteMany({where:{id:documentId}});
      await source.shopMediaAsset.deleteMany({where:{createdById:adminId}});
      await source.shopAdminSession.deleteMany({where:{adminId}});
      await source.shopAdmin.delete({where:{id:adminId}});
    }
    await source.$disconnect();
    await rm(root,{recursive:true,force:true});
  });
  const media = join(root,'media'), backups=join(root,'backups'), release=join(root,'release');
  for (const path of [media,backups,release]) await mkdir(path,{mode:0o700});
  const admin = await source.shopAdmin.create({data:{email:`recovery-${suffix}@example.invalid`,passwordHash:'unused-test-hash',role:'publisher'}});
  adminId=admin.id;
  const token=randomBytes(32).toString('hex');
  await source.shopAdminSession.create({data:{adminId,tokenHash:digest(token),expiresAt:new Date(Date.now()+600000)}});
  const assets=[];
  for (const [label,color] of [['Published room','#a32456'],['Private room','#987654'],['Orphan image','#123456']]) {
    const bytes=await sharp({create:{width:24,height:16,channels:3,background:color}}).webp().toBuffer();
    const sha=digest(bytes), storageKey=sha+'.webp';
    await writeFile(join(media,storageKey),bytes,{mode:0o600});
    assets.push({bytes,sha,storageKey,url:'/media/uploads/'+storageKey});
    if(label!=='Orphan image') await source.shopMediaAsset.create({data:{sha256:sha,storageKey,label,width:24,height:16,bytes:bytes.length,mimeType:'image/webp',createdById:adminId}});
  }
  const content={campaigns:[{artwork:{desktopImage:assets[0].url,mobileImage:assets[0].url}}]};
  await source.$transaction(async tx=>{
    await prepareMediaForPublication(tx,content,media);
    await tx.shopContent.create({data:{id:documentId,version:1,draft:content,published:content,publishedVersion:1}});
    await tx.shopContentRevision.create({data:{documentId,version:1,action:'publish',content,actorId:adminId}});
  });
  const pairId='fixture-'+suffix;
  const manifest=await backupPair({backupRoot:backups,mediaSource:media,sourceRelease:{path:release,sha:'a'.repeat(40)},pairId,
    postgres:{binDirectory:pgBin,host:sourceUrl.hostname,port:Number(sourceUrl.port),database:'shopmaple_test',user:decodeURIComponent(sourceUrl.username),password:decodeURIComponent(sourceUrl.password)}});
  assert.equal(manifest.media.files,3,'complete pair must retain published, private and orphan files');
  const pair=join(backups,pairId);
  await verifyPair(pair,{pgRestorePath:join(pgBin,'pg_restore')});
  await pg('createdb',[recoveryName]); created=true;
  await pg('pg_restore',['--exit-on-error','--no-owner','--dbname',recoveryName,join(pair,manifest.database.file)]);
  const restored=join(root,'restored-media');
  assert.equal(restoreMediaBackup(join(pair,manifest.media.directory),restored).files,3);
  recovery=new PrismaClient({datasources:{db:{url:recoveryUrl.href}}});
  const restoredContent=await recovery.shopContent.findUniqueOrThrow({where:{id:documentId}});
  assert.deepEqual(restoredContent.published,content);
  assert.equal(await recovery.shopContentRevision.count({where:{documentId}}),1);
  const rows=await recovery.shopMediaAsset.findMany({where:{createdById:adminId}});
  assert.equal(rows.length,2);
  for(const row of rows) {
    const bytes=await readFile(join(restored,row.storageKey));
    assert.equal(bytes.length,row.bytes);assert.equal(digest(bytes),row.sha256);
  }
  for(const asset of assets) assert.deepEqual(await readFile(join(restored,asset.storageKey)),asset.bytes);
  const app=express();registerMediaRoutes(app,recovery,{webOrigin:'http://localhost:3000',secureCookies:false,mediaRoot:restored});
  app.use((error,_req,res,_next)=>res.status(error instanceof HttpError?error.status:500).json({code:error.code??'SERVER_ERROR'}));
  const publicResponse=await request(app).get(content.campaigns[0].artwork.desktopImage);
  assert.equal(publicResponse.status,200);assert.deepEqual(publicResponse.body,assets[0].bytes);
  assert.match(publicResponse.headers['cache-control'],/immutable/);
  for(const asset of assets.slice(1)) assert.equal((await request(app).get(asset.url)).status,404);
  assert.equal((await request(app).get(`/api/admin/media/${assets[1].sha}/preview`)).status,401);
  const privateResponse=await request(app).get(`/api/admin/media/${assets[1].sha}/preview`).set('Cookie',`shop_admin=${token}`);
  assert.equal(privateResponse.status,200);assert.deepEqual(privateResponse.body,assets[1].bytes);
  assert.match(privateResponse.headers['cache-control'],/no-store/);
});
