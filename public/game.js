const socket=io();const $=id=>document.getElementById(id);const canvas=$('board'),ctx=canvas.getContext('2d');
let me=-1,state=null,pointer=400,room='',lastMsg='';const params=new URLSearchParams(location.search);$('code').value=(params.get('room')||'').slice(0,6).toUpperCase();
$('name').value=localStorage.getItem('burgerName')||'플레이어';
$('join').onclick=()=>{const name=$('name').value.trim()||'플레이어';localStorage.setItem('burgerName',name);socket.emit('join',{code:$('code').value,name});};
$('copy').onclick=async()=>{const url=location.origin+'/?room='+room;try{await navigator.clipboard.writeText(url);toast('초대 링크를 복사했어요!');}catch{prompt('초대 링크를 복사하세요',url)}};
$('restart').onclick=()=>socket.emit('restart');
socket.on('joined',d=>{me=d.slot;room=d.code;history.replaceState(null,'','/?room='+room);$('lobby').hidden=true;$('game').hidden=false;$('invite').textContent='초대 코드: '+room;});
socket.on('error-message',toast);
socket.on('state',s=>{state=s;room=s.code;for(let i=0;i<2;i++){const e=$('p'+i);e.textContent=(s.names[i]||'입장 대기 중')+(me===i?' (나)':'');e.classList.toggle('active',s.status==='playing'&&s.turn===i&&!s.falling);}const myTurn=s.status==='playing'&&s.turn===me&&!s.falling;
 let message=s.status==='waiting'?'친구의 입장을 기다리는 중':s.status==='over'?(s.loser===me?'😵 아쉽다! 패배!':'🎉 축하해요! 승리!'):s.falling?'🍔 재료가 내려오는 중...':myTurn?'🔥 내 차례! 클릭해서 쌓으세요':'⏳ 상대방 차례';
 $('status').textContent=message;$('room').textContent='쌓은 재료 '+s.moves+'개';$('overlay').hidden=s.status==='playing';$('overlayText').textContent=message;$('restart').hidden=s.status!=='over';});
socket.on('disconnect',()=>toast('서버와 연결이 끊어졌습니다. 재접속을 시도합니다.'));
function toast(msg){$('toast').textContent=msg;clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('toast').textContent='',4200)}
function cursorX(e){const r=canvas.getBoundingClientRect();return Math.max(110,Math.min(690,(e.clientX-r.left)*800/r.width))}
canvas.addEventListener('pointermove',e=>{pointer=cursorX(e)});
canvas.addEventListener('pointerdown',e=>{pointer=cursorX(e);if(state&&state.status==='playing'&&state.turn===me&&!state.falling)socket.emit('place',{x:pointer});});
function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill()}
function rounded(x,y,w,h,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fill()}
function ingredient(p,alpha=1){ctx.save();ctx.globalAlpha=alpha;ctx.translate(p.x,p.y);ctx.rotate(p.angle||0);const w=p.w,h=p.h,x=-w/2,y=-h/2;
 switch(p.type){
 case 'patty':rounded(x,y,w,h,15,'#7c432b');rounded(x+7,y+5,w-14,h-10,12,'#a45b36');for(let i=-2;i<=2;i++)ellipse(i*26,0,7,3,'#693721');break;
 case 'cheese':rounded(x,y,w,h,4,'#f4bb23');ctx.fillStyle='#ffdb4e';ctx.beginPath();ctx.moveTo(x+35,y);ctx.lineTo(x+68,y+h+11);ctx.lineTo(x+94,y);ctx.fill();break;
 case 'lettuce':for(let i=0;i<8;i++)ellipse(x+14+i*(w-28)/7,Math.sin(i*2)*5,w/9,h*.54,i%2?'#68b447':'#83d255');rounded(x+12,y+7,w-24,h-15,8,'#8bd25b');break;
 case 'tomato':rounded(x,y,w,h,13,'#d84936');rounded(x+5,y+4,w-10,h-8,9,'#f26d58');for(let i=0;i<4;i++)ellipse(-45+i*30,0,8,3,'#f7aa84');break;
 case 'onion':rounded(x,y,w,h,13,'#bd91c5');rounded(x+8,y+4,w-16,h-8,11,'#f0c6e8');for(let i=0;i<3;i++)ellipse(-32+i*32,0,12,6,'#d4a3d8');break;
 case 'pickle':rounded(x,y,w,h,13,'#517c32');rounded(x+5,y+3,w-10,h-6,13,'#83a84c');for(let i=0;i<5;i++)ellipse(-40+i*20,0,3,3,'#d5db7c');break;
 case 'bacon':rounded(x,y,w,h,9,'#9a4635');rounded(x+5,y+4,w-10,h-8,6,'#d47b61');for(let i=0;i<4;i++)rounded(-53+i*29,-6,13,12,5,'#f3b691');break;
 }
 ctx.restore()}
function draw(){ctx.clearRect(0,0,800,600);const sky=ctx.createLinearGradient(0,0,0,600);sky.addColorStop(0,'#dcf7fb');sky.addColorStop(1,'#f8f6d6');ctx.fillStyle=sky;ctx.fillRect(0,0,800,600);
 for(let i=0;i<8;i++)ellipse(i*120+40,75+(i%3)*40,45,12,'#ffffff87');
 ctx.fillStyle='#f0c393';ctx.fillRect(0,535,800,65);ctx.fillStyle='#d7a277';ctx.fillRect(0,535,800,9);
 // Static bottom bun: this is the foundation for the tower.
 rounded(305,487,190,38,17,'#cb863d');rounded(310,488,180,21,11,'#e6a34e');for(let i=0;i<6;i++)ellipse(335+i*25,494+i%2*6,4,2,'#fff3ca');
 if(state){for(const p of state.pieces)ingredient(p);
 if(state.status==='playing'&&!state.falling&&state.turn===me&&state.next){const t=state.next;ingredient({...t,type:t.id,x:pointer,y:83,angle:0},.70);ctx.strokeStyle='#b77d6299';ctx.setLineDash([6,9]);ctx.beginPath();ctx.moveTo(pointer,105);ctx.lineTo(pointer,475);ctx.stroke();ctx.setLineDash([]);rounded(15,15,188,45,14,'#ffffffd9');ctx.fillStyle='#563f2c';ctx.font='bold 19px system-ui';ctx.fillText('다음: '+t.name,29,44);}
 else if(state.status==='playing'&&state.next){rounded(15,15,210,45,14,'#ffffffd9');ctx.fillStyle='#563f2c';ctx.font='bold 17px system-ui';ctx.fillText('다음 재료: '+state.next.name,29,43)}}
 requestAnimationFrame(draw)}draw();
