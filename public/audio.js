// Music is synthesized locally; no external music files or third-party licenses.
window.burgerAudio=(()=>{let ctx=null,enabled=false,timer=null,index=0,scene='lobby';
const songs={lobby:[[523,659,784,659],[587,698,880,698],[659,784,988,784],[523,659,784,1046]],coop:[[523,659,784,659],[494,587,698,587],[440,523,659,523],[392,494,587,494]],versus:[[220,330,440,660],[246,370,494,740],[261,392,523,784],[196,294,392,587]]};
function ensure(){if(!ctx){const C=window.AudioContext||window.webkitAudioContext;if(!C)return null;ctx=new C()}if(ctx.state==='suspended')ctx.resume();return ctx}
function tone(freq,duration=.13,type='sine',vol=.025,offset=0){if(!enabled||!ensure())return;let o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+offset;o.type=type;o.frequency.setValueAtTime(Math.max(50,freq),t);g.gain.setValueAtTime(.001,t);g.gain.linearRampToValueAtTime(vol,t+.015);g.gain.exponentialRampToValueAtTime(.001,t+duration);o.connect(g).connect(ctx.destination);o.start(t);o.stop(t+duration+.02)}
function tick(){if(!enabled)return;const seq=songs[scene]||songs.lobby,notes=seq[Math.floor(index/4)%seq.length];tone(notes[index%4],scene==='versus'?.14:.23,scene==='versus'?'triangle':'sine',.015);if(index%4===0)tone(notes[0]/2,.21,'triangle',.009);index++}
function stop(){if(timer){clearInterval(timer);timer=null}}
function setScene(v){if(scene===v)return;scene=v;index=0;if(enabled){stop();timer=setInterval(tick,scene==='versus'?175:255)}}
function toggle(){enabled=!enabled;if(enabled){ensure();stop();timer=setInterval(tick,scene==='versus'?175:255);tick()}else stop();return enabled}
function sfx(kind){if(!enabled)return;const f={join:[784,988],drop:[460,340],land:[190,135],collapse:[330,220,110],lose:[392,294,196,130],win:[523,659,784,1046]}[kind]||[];f.forEach((v,i)=>tone(v,.13,kind==='collapse'?'sawtooth':'triangle',.048,i*.105))}
return {toggle,setScene,sfx,isOn:()=>enabled};})();
