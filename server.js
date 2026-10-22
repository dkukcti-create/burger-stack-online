const express=require('express'),http=require('http'),{Server}=require('socket.io'),Matter=require('matter-js'),path=require('path'),crypto=require('crypto');
const app=express();app.use(express.static(path.join(__dirname,'public')));app.get('/health',(_,res)=>res.json({ok:true,version:'3.0.0'}));
const server=http.createServer(app),io=new Server(server),PORT=process.env.PORT||3000;
const W=800,H=600,FLOOR=535,BASE_Y=506;
const TYPES=[{id:'patty',name:'패티',w:156,h:34,density:.0026},{id:'cheese',name:'치즈',w:169,h:22,density:.0019},{id:'lettuce',name:'양상추',w:185,h:25,density:.0011},{id:'tomato',name:'토마토',w:147,h:27,density:.0018},{id:'onion',name:'양파',w:130,h:22,density:.0016},{id:'pickle',name:'피클',w:111,h:20,density:.0016},{id:'bacon',name:'베이컨',w:151,h:23,density:.0018}];
const rooms=new Map(),rand=()=>TYPES[Math.floor(Math.random()*TYPES.length)],clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const cleanCode=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
function makeCode(){let c;do{c=crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase()}while(rooms.has(c));return c;}
function arena(){const engine=Matter.Engine.create({gravity:{x:0,y:1.65,scale:.001}});const ground=Matter.Bodies.rectangle(400,FLOOR+29,2000,58,{isStatic:true,friction:.9});const base=Matter.Bodies.rectangle(400,BASE_Y,188,38,{isStatic:true,friction:.85});Matter.Composite.add(engine.world,[ground,base]);return {engine,ground,base,pieces:[],falling:null,moves:0,eliminated:false};}
function room(code){return {code,players:Array(4).fill(null),names:Array(4).fill(''),host:null,status:'waiting',mode:'coop',turn:0,next:rand(),previews:[400,400,400,400],arenas:[],loser:null,winner:null,created:Date.now(),emptyAt:null};}
const active=r=>r.players.map((p,i)=>p?i:-1).filter(x=>x>=0);
const nextSlot=(r,s)=>{const arr=active(r);return arr[(arr.indexOf(s)+1)%arr.length]};
function pieces(a){return a.pieces.map(p=>({id:p.body.id,type:p.type.id,x:p.body.position.x,y:p.body.position.y,angle:p.body.angle,w:p.type.w,h:p.type.h,owner:p.owner}));}
function snapshot(r){return {code:r.code,status:r.status,mode:r.mode,players:r.players.map(Boolean),names:r.names,host:r.host,turn:r.turn,next:r.next,previews:r.previews,loser:r.loser,winner:r.winner,arenas:r.arenas.map(a=>({pieces:pieces(a),falling:!!a.falling,moves:a.moves,eliminated:a.eliminated}))};}
function send(r){io.to(r.code).emit('state',snapshot(r))}
function reset(r){r.arenas=r.mode==='coop'?[arena()]:Array.from({length:4},()=>arena());r.turn=active(r)[0];r.next=rand();r.loser=null;r.winner=null;r.previews=[400,400,400,400];r.status='playing';send(r)}
function leave(socket){const {code,slot}=socket.data||{};if(!code)return;const r=rooms.get(code);socket.leave(code);socket.data={};if(!r||r.players[slot]!==socket.id)return;r.players[slot]=null;r.names[slot]='';if(r.host===slot)r.host=active(r)[0]??null;if(r.status==='playing'){r.status='waiting';r.arenas=[];r.loser=null;r.winner=null;}if(!active(r).length)r.emptyAt=Date.now();send(r)}
function join(socket,d){let code=cleanCode(d?.code);if(!code)code=makeCode();let r=rooms.get(code);if(!r){r=room(code);rooms.set(code,r)}if(r.status==='playing'){socket.emit('error-message','진행 중인 게임에는 입장할 수 없습니다.');return;}const slot=r.players.indexOf(null);if(slot<0){socket.emit('error-message','최대 네 명까지 입장할 수 있습니다.');return;}if(socket.data.code)leave(socket);r.players[slot]=socket.id;r.names[slot]=String(d?.name||`플레이어 ${slot+1}`).trim().slice(0,16)||`플레이어 ${slot+1}`;if(r.host==null)r.host=slot;r.emptyAt=null;socket.join(code);socket.data={code,slot};socket.emit('joined',{code,slot});send(r)}
function drop(a,type,x,owner){const highest=a.pieces.length?Math.min(...a.pieces.map(p=>p.body.bounds.min.y)):BASE_Y-19;const y=clamp(highest-105,65,380);const body=Matter.Bodies.rectangle(x,y,type.w,type.h,{chamfer:{radius:Math.min(9,type.h/3)},density:type.density,friction:.88,frictionStatic:1.6,restitution:.015,sleepThreshold:90,label:'ingredient'});Matter.Composite.add(a.engine.world,body);a.pieces.push({body,type,owner});a.moves++;a.falling={started:Date.now(),owner}}
function crashed(a){return a.pieces.some(p=>{const b=p.body;return (b.position.y+p.type.h/2>=FLOOR-5&&(Math.abs(b.position.x-400)>100||b.position.y>FLOOR-18))||b.position.x<-25||b.position.x>W+25||b.position.y>H+100})}
function finishVersus(r){const alive=active(r).filter(i=>!r.arenas[i].eliminated);if(alive.length<=1){r.status='over';r.winner=alive[0]??null;send(r)}}
io.on('connection',socket=>{
 socket.on('join',d=>join(socket,d));
 socket.on('mode',mode=>{const {code,slot}=socket.data||{},r=rooms.get(code);if(!r||r.host!==slot||r.status==='playing'||!['coop','versus'].includes(mode))return;r.mode=mode;send(r)});
 socket.on('start',()=>{const {code,slot}=socket.data||{},r=rooms.get(code);if(!r||r.host!==slot||!['waiting','over'].includes(r.status))return;if(active(r).length<2){socket.emit('error-message','최소 2명이 필요합니다.');return;}reset(r)});
 socket.on('preview',d=>{const {code,slot}=socket.data||{},r=rooms.get(code);if(!r||r.status!=='playing'||r.players[slot]!==socket.id)return;const a=r.arenas[r.mode==='coop'?0:slot];if(!a||a.eliminated||a.falling||(r.mode==='coop'&&r.turn!==slot))return;const x=Number(d?.x);if(!Number.isFinite(x))return;r.previews[slot]=clamp(x,110,690);socket.to(code).emit('preview',{slot,x:r.previews[slot]})});
 socket.on('place',d=>{const {code,slot}=socket.data||{},r=rooms.get(code);if(!r||r.status!=='playing'||r.players[slot]!==socket.id)return;if(r.mode==='coop'&&r.turn!==slot)return;const a=r.arenas[r.mode==='coop'?0:slot];if(!a||a.falling||a.eliminated)return;const x=clamp(Number(d?.x)||400,110,690);r.previews[slot]=x;drop(a,r.mode==='coop'?r.next:rand(),x,slot);send(r)});
 socket.on('restart',()=>{const {code,slot}=socket.data||{},r=rooms.get(code);if(r&&r.host===slot&&r.status==='over'&&active(r).length>=2)reset(r)});
 socket.on('disconnect',()=>leave(socket));
});
const STEP=1000/60;
setInterval(()=>{for(const r of rooms.values()){if(r.status!=='playing')continue;for(let i=0;i<r.arenas.length;i++){const a=r.arenas[i];if(r.mode==='versus'&&!r.players[i])continue;Matter.Engine.update(a.engine,STEP);if(!a.falling||a.eliminated)continue;const elapsed=Date.now()-a.falling.started;if(crashed(a)&&elapsed>350){const owner=a.falling.owner;a.falling=null;a.eliminated=true;if(r.mode==='coop'){r.status='over';r.loser=owner;send(r)}else{finishVersus(r);send(r)}continue;}if(elapsed>2700){a.falling=null;if(r.mode==='coop'){r.turn=nextSlot(r,r.turn);r.next=rand()}send(r)}}}},STEP);
setInterval(()=>{for(const r of rooms.values())if(active(r).length&&r.status==='playing')send(r)},1000/24);
setInterval(()=>{for(const [code,r]of rooms)if(r.emptyAt&&Date.now()-r.emptyAt>20*60*1000)rooms.delete(code)},60000);
server.listen(PORT,()=>console.log(`Burger Stack v3 listening on ${PORT}`));
