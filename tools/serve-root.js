const http=require('http'),fs=require('fs'),p=require('path');
const ROOT=require('path').resolve(__dirname,'..');
http.createServer((q,s)=>{
  const f=p.join(ROOT, q.url==='/'?'index.html':decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f,(e,d)=>{ if(e){s.writeHead(404);s.end('404');}else{s.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});s.end(d);} });
}).listen(8790,()=>console.log('http://localhost:8790'));
