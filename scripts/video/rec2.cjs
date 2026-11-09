const { chromium } = require('playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch();const c=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true,recordVideo:{dir:__dirname+'/clips',size:{width:780,height:1688}}});const p=await c.newPage();const t0=Date.now();
await p.goto('https://yeshdeal.com/',{waitUntil:'networkidle'});await new Promise(r=>setTimeout(r,800));
await p.evaluate(()=>{const e=document.getElementById('picks');window.scrollTo(0,e.getBoundingClientRect().top+window.scrollY-60)});await new Promise(r=>setTimeout(r,1500));
const start=(Date.now()-t0)/1000;
for(let i=0;i<3;i++){await p.evaluate(()=>{const r=document.querySelector('.picks-row');r.scrollBy({left:-r.clientWidth*0.72,behavior:'smooth'})});await new Promise(r=>setTimeout(r,1300))}
const end=(Date.now()-t0)/1000;const v=p.video();await c.close();fs.renameSync(await v.path(),__dirname+'/clips/picks.webm');await b.close();
const m=JSON.parse(fs.readFileSync(__dirname+'/marks.json'));m.picks={start,end};fs.writeFileSync(__dirname+'/marks.json',JSON.stringify(m,null,1));console.log(start,end)})()
