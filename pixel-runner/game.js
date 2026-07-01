const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d'),$=s=>document.querySelector(s);
const TILE=48,COLS=80,ROWS=12,GRAVITY=1600;
const keys={left:false,right:false,jump:false};
let map,hero,enemies=[],coins=[],treasures=[],camera=0,score=0,lives=3,stage=0,running=false,paused=false,last=0,audio,nextAction='restart';

const LEVELS=[[
  '', '', '',
  '                                     C C                         C',
  '          QQQ        BBBB       QBB        QBB       BBQBB',
  '                              C                                BBB',
  '                        P                    P            C',
  '       C       E           K             E       K                    E      F',
  '  S           ####         #####             ######       ####            #######',
  '######   ###########   ############   ##############   ###########   ###########',
  '######   ###########   ############   ##############   ###########   ###########',
  '######   ###########   ############   ##############   ###########   ###########'
],[
  '', '',
  '                                      Q Q Q',
  '                           BBBB                   BBBB',
  '                  QQQ                                  QQQ',
  '                                                                    Q',
  '          P            K                K                  P',
  '  S              E             K                 E             M',
  '################################################################################',
  '################################################################################',
  '################################################################################',
  '################################################################################'
]];

function resetGame(){lives=3;score=0;stage=0;loadLevel(0)}
function loadLevel(index){
  stage=index;map=LEVELS[index].map(row=>row.padEnd(COLS).slice(0,COLS).split(''));
  enemies=[];coins=[];treasures=[];let start={x:96,y:300};
  map.forEach((row,y)=>row.forEach((value,x)=>{
    if(value==='S'){start={x:x*TILE,y:y*TILE};map[y][x]=' '}
    if(value==='E'||value==='K'||value==='M'){
      const type=value==='E'?'walker':value==='K'?'turtle':'boss';
      const size=type==='boss'?64:type==='turtle'?44:38;
      enemies.push({type,x:x*TILE,y:y*TILE-size,w:size,h:size,vx:type==='boss'?-105:-75,vy:0,alive:true,shell:false,hp:type==='boss'?3:1,invincible:0});
      map[y][x]=' ';
    }
    if(value==='C'){coins.push({x:x*TILE+12,y:6*TILE+10,taken:false});map[y][x]=' '}
  }));
  (index===0?[11,35,55]:[12,34,57]).forEach(x=>map[6][x]='Q');
  hero={x:start.x,y:start.y-44,w:34,h:44,vx:0,vy:0,ground:false,dead:false,invincible:0};
  camera=0;running=true;paused=false;last=performance.now();nextAction='restart';hideOverlay();updateHud();draw();requestAnimationFrame(loop);
}

function solid(tx,ty){if(tx<0||tx>=COLS||ty<0||ty>=ROWS)return false;return '#BPQ'.includes(map[ty][tx])}
function physics(object,dt){object.vy+=GRAVITY*dt;object.x+=object.vx*dt;collide(object,'x');object.y+=object.vy*dt;object.ground=false;collide(object,'y')}
function collide(object,axis){
  const left=Math.floor(object.x/TILE),right=Math.floor((object.x+object.w-1)/TILE),top=Math.floor(object.y/TILE),bottom=Math.floor((object.y+object.h-1)/TILE);
  for(let tx=left;tx<=right;tx++)for(let ty=top;ty<=bottom;ty++)if(solid(tx,ty)){
    if(axis==='x'){
      if(object.vx>0)object.x=tx*TILE-object.w;else if(object.vx<0)object.x=(tx+1)*TILE;
      object.vx=0;
    }else{
      if(object.vy>0){object.y=ty*TILE-object.h;object.ground=true}
      else if(object.vy<0){if(object===hero&&map[ty][tx]==='Q')openTreasure(tx,ty);object.y=(ty+1)*TILE}
      object.vy=0;
    }
  }
}
function openTreasure(tx,ty){
  map[ty][tx]='B';score+=250;treasures.push({x:tx*TILE+12,y:ty*TILE-8,life:1});tone(880,.09);updateHud();
}

function update(dt){
  hero.invincible=Math.max(0,hero.invincible-dt);hero.vx=(keys.right-keys.left)*270;
  if(keys.jump&&hero.ground){hero.vy=-620;hero.ground=false;tone(420,.05)}
  physics(hero,dt);if(hero.y>650)return loseLife();
  coins.forEach(coin=>{if(!coin.taken&&overlap(hero,{x:coin.x,y:coin.y,w:24,h:24})){coin.taken=true;score+=100;tone(760,.05)}});
  treasures.forEach(item=>{item.y-=70*dt;item.life-=dt});treasures=treasures.filter(item=>item.life>0);
  enemies.forEach(enemy=>updateEnemy(enemy,dt));
  if(stage===0){const flagX=map.find(row=>row.includes('F'))?.indexOf('F')*TILE;if(flagX>=0&&hero.x>flagX)enterBossStage()}
  camera=Math.max(0,Math.min(hero.x-300,COLS*TILE-960));updateHud();
}
function updateEnemy(enemy,dt){
  if(!enemy.alive)return;enemy.invincible=Math.max(0,enemy.invincible-dt);
  const oldVx=enemy.vx;physics(enemy,dt);if(oldVx&&enemy.vx===0)enemy.vx=-oldVx;
  if(enemy.y>650){enemy.alive=false;return}
  if(!overlap(hero,enemy)||hero.dead||enemy.invincible>0)return;
  const stomp=hero.vy>100&&hero.y+hero.h-enemy.y<28;
  if(stomp){
    hero.vy=-350;
    if(enemy.type==='turtle'&&!enemy.shell){enemy.shell=true;enemy.h=28;enemy.y+=16;enemy.vx=0;score+=250;tone(210,.08)}
    else if(enemy.type==='turtle'&&enemy.shell){enemy.vx=(hero.x<enemy.x?1:-1)*360;score+=150;tone(300,.07)}
    else if(enemy.type==='boss'){
      enemy.hp--;enemy.invincible=.8;enemy.vx*=-1;score+=500;tone(120+enemy.hp*70,.14);
      if(enemy.hp<=0){enemy.alive=false;winGame()}
    }else{enemy.alive=false;score+=200;tone(190,.08)}
  }else if(hero.invincible<=0)loseLife();
}
function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}
function enterBossStage(){running=false;nextAction='boss';showOverlay('CASTLE 1–2','魔王關開啟','穿越城堡，踩擊魔王三次來拯救像素世界。','進入魔王關')}
function winGame(){running=false;nextAction='restart';score+=2000;showOverlay('ALL CLEAR','冒險成功！',`魔王已被擊敗，最終得到 <b>${score}</b> 分。`,'重新冒險');updateHud()}
function loseLife(){
  if(hero.dead||hero.invincible>0)return;hero.dead=true;lives--;tone(90,.3);updateHud();
  if(lives<=0){running=false;nextAction='restart';showOverlay('GAME OVER','冒險結束','再試一次，寶物與魔王都在等著你。','重新挑戰');return}
  setTimeout(()=>{const currentStage=stage;loadLevel(currentStage);hero.invincible=1.5},650);
}

function drawTile(tx,ty,value){
  const px=tx*TILE-camera,py=ty*TILE;
  if(value==='#'){ctx.fillStyle=stage?'#584858':'#9b6033';ctx.fillRect(px,py,TILE,TILE);ctx.fillStyle=stage?'#8f718b':'#d6964c';ctx.fillRect(px,py,TILE,8);ctx.strokeStyle='#4b3030';ctx.strokeRect(px+.5,py+.5,TILE-1,TILE-1)}
  if(value==='B'||value==='Q'){ctx.fillStyle=value==='Q'?'#ffc83d':'#e2793e';ctx.fillRect(px+2,py+2,TILE-4,TILE-4);ctx.fillStyle=value==='Q'?'#7c4c20':'#ffc05b';ctx.font='bold 25px monospace';ctx.textAlign='center';ctx.fillText(value==='Q'?'?':'•',px+24,py+33);ctx.strokeStyle='#743625';ctx.strokeRect(px+2,py+2,TILE-4,TILE-4)}
  if(value==='P'){ctx.fillStyle='#49a654';ctx.fillRect(px+5,py,TILE-10,TILE);ctx.fillStyle='#82e66f';ctx.fillRect(px,py,TILE,10)}
}
function draw(){
  ctx.fillStyle=stage?'#241b32':'#63c9f1';ctx.fillRect(0,0,960,540);
  if(!stage){ctx.fillStyle='#fff';for(let i=0;i<8;i++){let px=(i*190-camera*.18)%1200;if(px<0)px+=1200;ctx.fillRect(px,78+(i%3)*50,70,18);ctx.fillRect(px+18,66+(i%3)*50,35,18)}}
  else{ctx.fillStyle='#675278';for(let i=0;i<16;i++)ctx.fillRect(i*90-(camera*.15%90),70+(i%4)*55,18,32)}
  map.forEach((row,y)=>row.forEach((value,x)=>value!==' '&&value!=='F'&&drawTile(x,y,value)));
  coins.forEach((coin,i)=>{if(coin.taken)return;ctx.fillStyle='#ffd43b';ctx.beginPath();ctx.ellipse(coin.x+12-camera,coin.y+12,7+Math.sin(performance.now()/150+i)*3,12,0,0,7);ctx.fill()});
  treasures.forEach(item=>{ctx.fillStyle='#fff36b';ctx.font='26px serif';ctx.fillText('★',item.x-camera,item.y)});
  enemies.forEach(drawEnemy);drawFlag();drawHero();
}
function drawEnemy(enemy){
  if(!enemy.alive||enemy.invincible>0&&Math.floor(enemy.invincible*12)%2)return;const px=enemy.x-camera;
  if(enemy.type==='walker'){ctx.fillStyle='#623b35';ctx.fillRect(px,enemy.y+10,enemy.w,enemy.h-10)}
  if(enemy.type==='turtle'){ctx.fillStyle='#49a654';ctx.beginPath();ctx.ellipse(px+enemy.w/2,enemy.y+enemy.h/2,enemy.w/2,enemy.h/2,0,0,7);ctx.fill();if(!enemy.shell){ctx.fillStyle='#ffe0a8';ctx.fillRect(px+7,enemy.y-5,22,18)}}
  if(enemy.type==='boss'){ctx.fillStyle='#9c45d5';ctx.fillRect(px,enemy.y+12,enemy.w,enemy.h-12);ctx.fillStyle='#ffd447';ctx.fillRect(px+6,enemy.y,52,18);ctx.fillStyle='#fff';ctx.fillRect(px+12,enemy.y+26,10,11);ctx.fillRect(px+42,enemy.y+26,10,11);ctx.fillStyle='#ef4b3f';ctx.fillRect(px+15,enemy.y-8,7,10);ctx.fillRect(px+42,enemy.y-8,7,10)}
  if(enemy.type!=='turtle'||!enemy.shell){ctx.fillStyle='#111';ctx.fillRect(px+10,enemy.y+17,4,6);ctx.fillRect(px+enemy.w-14,enemy.y+17,4,6)}
}
function drawFlag(){if(stage!==0)return;const row=map.find(r=>r.includes('F'));if(!row)return;const fx=row.indexOf('F')*TILE-camera;ctx.fillStyle='#eee';ctx.fillRect(fx,110,6,330);ctx.fillStyle='#ef4b3f';ctx.fillRect(fx+6,118,76,45);ctx.fillStyle='#ffd447';ctx.fillRect(fx+17,130,17,17)}
function drawHero(){if(hero.dead)return;const px=hero.x-camera;ctx.globalAlpha=hero.invincible>0&&Math.floor(hero.invincible*12)%2?.35:1;ctx.fillStyle='#f04c43';ctx.fillRect(px+4,hero.y,26,12);ctx.fillStyle='#ffd39b';ctx.fillRect(px+7,hero.y+12,22,14);ctx.fillStyle='#244f88';ctx.fillRect(px+3,hero.y+26,28,18);ctx.fillStyle='#fff';ctx.fillRect(px+21,hero.y+14,4,5);ctx.globalAlpha=1}
function loop(time){if(!running)return;const dt=Math.min((time-last)/1000,.03);last=time;if(!paused)update(dt);draw();requestAnimationFrame(loop)}
function updateHud(){$('#score').textContent=String(score).padStart(6,'0');$('#coins').textContent=String(coins.filter(c=>c.taken).length).padStart(2,'0');$('#lives').textContent='♥'.repeat(Math.max(lives,0))}
function showOverlay(kicker,title,message,button){$('#kicker').textContent=kicker;$('#title').textContent=title;$('#message').innerHTML=message;$('#start').textContent=button;$('#overlay').classList.remove('hidden')}
function hideOverlay(){$('#overlay').classList.add('hidden')}
function tone(frequency,duration){audio??=new AudioContext();const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='square';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.025,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);oscillator.connect(gain).connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+duration)}
function press(key,value){keys[key]=value}
document.addEventListener('keydown',event=>{const controls={arrowleft:'left',a:'left',arrowright:'right',d:'right',arrowup:'jump',w:'jump',' ':'jump'},key=controls[event.key.toLowerCase()];if(key){event.preventDefault();press(key,true)}if(event.key.toLowerCase()==='p'&&running){paused=!paused;paused?showOverlay('PAUSED','遊戲暫停','按 P 繼續冒險。','繼續'):hideOverlay()}});
document.addEventListener('keyup',event=>{const controls={arrowleft:'left',a:'left',arrowright:'right',d:'right',arrowup:'jump',w:'jump',' ':'jump'},key=controls[event.key.toLowerCase()];if(key)press(key,false)});
document.querySelectorAll('[data-key]').forEach(button=>{button.onpointerdown=event=>{event.preventDefault();press(button.dataset.key,true)};button.onpointerup=button.onpointercancel=()=>press(button.dataset.key,false)});
$('#start').onclick=()=>{if(paused){paused=false;hideOverlay()}else if(nextAction==='boss')loadLevel(1);else resetGame()};
map=LEVELS[0].map(row=>row.padEnd(COLS).slice(0,COLS).split(''));hero={x:96,y:300,w:34,h:44,dead:false,invincible:0};draw();updateHud();
