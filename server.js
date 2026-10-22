const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Matter = require('matter-js');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req,res)=>res.json({ok:true}));
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const W=800,H=600,FLOOR=535,BASE_Y=506;
const TYPES = [
  {id:'patty', name:'패티', w:156,h:34, density:0.0026, color:'#82452c'},
  {id:'cheese',name:'치즈', w:169,h:22,density:0.0019,color:'#f7bf35'},
  {id:'lettuce',name:'양상추',w:185,h:25,density:0.0011,color:'#67b64e'},
  {id:'tomato',name:'토마토',w:147,h:27,density:0.0018,color:'#ed624d'},
  {id:'onion',name:'양파',w:130,h:22,density:0.0016,color:'#d8b3df'},
  {id:'pickle',name:'피클',w:111,h:20,density:0.0016,color:'#6d9a48'},
  {id:'bacon',name:'베이컨',w:151,h:23,density:0.0018,color:'#b85d49'}
];
const rooms=new Map();
const rand=()=>TYPES[Math.floor(Math.random()*TYPES.length)];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const cleanCode=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6);
function makeCode(){let c;do{c=crypto.randomBytes(4).toString('hex').slice(0,6).toUpperCase()}while(rooms.has(c));return c;}
function buildRoom(code){
 const engine=Matter.Engine.create({gravity:{x:0,y:1.65,scale:0.001}});
 const ground=Matter.Bodies.rectangle(W/2,FLOOR+29,2000,58,{isStatic:true,friction:0.9,label:'ground'});
 const base=Matter.Bodies.rectangle(W/2,BASE_Y,188,38,{isStatic:true,friction:0.85,label:'base'});
 Matter.Composite.add(engine.world,[ground,base]);
 return {code,engine,ground,base,players:[null,null],names:['',''],status:'waiting',turn:0,next:rand(),pieces:[],moves:0,falling:null,loser:null,created:Date.now(),emptyAt:null};
}
function wirePiece(piece, type,owner){return {id:piece.id,type:type.id,x:piece.position.x,y:piece.position.y,angle:piece.angle,w:type.w,h:type.h,owner};}
function snapshot(r){return {code:r.code,status:r.status,players:r.players.map(Boolean),names:r.names,turn:r.turn,next:r.next,moves:r.moves,loser:r.loser,falling:!!r.falling,pieces:r.pieces.map(p=>wirePiece(p.body,p.type,p.owner))};}
function send(r){io.to(r.code).emit('state',snapshot(r));}
function restart(r){Matter.Composite.clear(r.engine.world,false);Matter.Composite.add(r.engine.world,[r.ground,r.base]);r.pieces=[];r.turn=0;r.next=rand();r.moves=0;r.falling=null;r.loser=null;r.status=r.players.every(Boolean)?'playing':'waiting';send(r);}
function join(socket,raw,name){
 let code=cleanCode(raw);
 if(!code){code=makeCode();}
 let r=rooms.get(code);
 if(!r){r=buildRoom(code);rooms.set(code,r);}
 const slot=r.players.indexOf(null);
 if(slot<0){socket.emit('error-message','이 방은 이미 두 명이 플레이 중입니다.');return;}
 if(socket.data.code) leave(socket);
 r.players[slot]=socket.id;r.names[slot]=String(name||`플레이어 ${slot+1}`).trim().slice(0,16)||`플레이어 ${slot+1}`;
 r.emptyAt=null;socket.join(code);socket.data={code,slot};socket.emit('joined',{code,slot});
 if(r.players.every(Boolean))restart(r);else send(r);
}
function leave(socket){const {code,slot}=socket.data||{};if(!code)return;const r=rooms.get(code);socket.leave(code);socket.data={};if(!r)return;if(r.players[slot]===socket.id){r.players[slot]=null;r.names[slot]='';r.status='waiting';r.falling=null;if(r.players.every(p=>!p))r.emptyAt=Date.now();send(r);}}
io.on('connection',socket=>{
 socket.on('join',(data={})=>join(socket,data.code,data.name));
 socket.on('place',data=>{
  const {code,slot}=socket.data||{};const r=rooms.get(code);if(!r||r.status!=='playing'||r.turn!==slot||r.falling||r.players[slot]!==socket.id)return;
  const type=r.next,x=clamp(Number(data?.x)||400,110,W-110);
  // Place just above the tallest current ingredient. Server decides vertical spawn and physics.
  const highest=r.pieces.length?Math.min(...r.pieces.map(p=>p.body.bounds.min.y)):BASE_Y-19;
  const y=clamp(highest-105,65,380);
  const body=Matter.Bodies.rectangle(x,y,type.w,type.h,{chamfer:{radius:Math.min(9,type.h/3)},density:type.density,friction:0.88,frictionStatic:1.6,restitution:0.015,sleepThreshold:90,label:'ingredient'});
  Matter.Composite.add(r.engine.world,body);r.pieces.push({body,type,owner:slot});r.moves++;r.falling={started:Date.now(),owner:slot};send(r);
 });
 socket.on('restart',()=>{const r=rooms.get(socket.data?.code);if(r&&r.players.every(Boolean)&&r.status==='over')restart(r);});
 socket.on('disconnect',()=>leave(socket));
});
const STEP=1000/60;
setInterval(()=>{
 for(const r of rooms.values()){
  if(r.status!=='playing')continue;
  Matter.Engine.update(r.engine,STEP);
  if(r.falling){
   const elapsed=Date.now()-r.falling.started;
   // A fallen ingredient is any ingredient that has slipped off the burger and reached the ground.
   const fallen=r.pieces.some(p=>p.body.position.y + p.type.h/2>=FLOOR-5 && (Math.abs(p.body.position.x-W/2)>100 || p.body.position.y>FLOOR-18));
   const escaped=r.pieces.some(p=>p.body.position.x<-25||p.body.position.x>W+25||p.body.position.y>H+100);
   if((fallen||escaped)&&elapsed>450){r.status='over';r.loser=r.falling.owner;r.falling=null;send(r);continue;}
   // Brief stabilization window lets pieces slide/collide before the turn switches.
   if(elapsed>2450){r.turn=1-r.turn;r.next=rand();r.falling=null;send(r);}
  }
 }
},STEP);
setInterval(()=>{for(const [code,r]of rooms)if(r.emptyAt&&Date.now()-r.emptyAt>20*60*1000)rooms.delete(code);},60000);
setInterval(()=>{for(const r of rooms.values())if(r.players.some(Boolean)&&r.status==='playing')send(r);},1000/18);
server.listen(PORT,()=>console.log(`Burger Stack listening on ${PORT}`));
