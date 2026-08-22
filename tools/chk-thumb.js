const https=require('https'), fs=require('fs');
const F=JSON.parse(fs.readFileSync('yt-final.json','utf8'));
const ids=[...new Set(Object.values(F).flat().map(v=>v.yt))];
function head(u){return new Promise(r=>{const q=https.request(u,{method:'HEAD',timeout:12000},s=>{r(s.statusCode);q.destroy();});q.on('error',()=>r(0));q.on('timeout',()=>{q.destroy();r(0);});q.end();});}
(async()=>{let max=0,mq=0,bad=[];
for(let i=0;i<ids.length;i+=8){
  const b=ids.slice(i,i+8);
  const rs=await Promise.all(b.map(id=>head('https://i.ytimg.com/vi/'+id+'/maxresdefault.jpg')));
  rs.forEach((c,k)=>{ if(c===200)max++; else bad.push(b[k]); });
}
for(const id of bad){ const c=await head('https://i.ytimg.com/vi/'+id+'/mqdefault.jpg'); if(c===200)mq++; }
console.log('총 '+ids.length+'건');
console.log('  maxresdefault 있음 : '+max);
console.log('  없음 → mqdefault 대체 성공 : '+mq+' / '+bad.length);
console.log('  둘 다 실패 : '+(bad.length-mq));
})();
