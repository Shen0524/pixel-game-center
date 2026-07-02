const canvas=document.querySelector('#game'),ctx=canvas.getContext('2d'),$=s=>document.querySelector(s);
const TILE=48,COLS=80,ROWS=12,GRAVITY=1600;
const keys={left:false,right:false,jump:false,down:false,fire:false};
let map,hero,enemies=[],coins=[],treasures=[],fireballs=[],camera=0,score=0,lives=3,stage=0,running=false,paused=false,last=0,audio,nextAction='restart',loopToken=0,fireCooldown=0,bossDefeated=false;
let coinsCollected=0,starsCollected=0,openedBlocks=0,nextLifeAt=20,bonusUsed=false;

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
],[
  '', '', '', '', '',
  '   C C C C C C C C C C C C C C C C C C C C',
  '                                                  P',
  '  S                                               P',
  '################################################################################',
  '################################################################################',
  '################################################################################',
  '################################################################################'
]];

function resetGame(){lives=3;score=0;stage=0;coinsCollected=0;starsCollected=0;openedBlocks=0;nextLifeAt=20;bonusUsed=false;loadLevel(0)}
function loadLevel(index){
  stage=index;map=LEVELS[index].map(row=>row.padEnd(COLS).slice(0,COLS).split(''));
  enemies=[];coins=[];treasures=[];fireballs=[];let start={x:96,y:300};
  map.forEach((row,y)=>row.forEach((value,x)=>{
    if(value==='S'){start={x:x*TILE,y:y*TILE};map[y][x]=' '}
    if(value==='E'||value==='K'||value==='M'){
      const type=value==='E'?'walker':value==='K'?'turtle':'boss';
      const size=type==='boss'?78:type==='turtle'?44:38;
      enemies.push({type,x:type==='boss'?64*TILE:x*TILE,y:y*TILE-size,w:size,h:size,vx:type==='boss'?0:-75,vy:0,alive:true,shell:false,hp:type==='boss'?3:1,invincible:0,awake:type!=='boss',patrolMin:58*TILE,patrolMax:72*TILE});
      map[y][x]=' ';
    }
    if(value==='C'){coins.push({x:x*TILE+12,y:6*TILE+10,taken:false});map[y][x]=' '}
  }));
  const decorativeRows=index===1?map:map.slice(0,4);
  decorativeRows.forEach(row=>row.forEach((value,x)=>{if(value==='Q')row[x]='B'}));
  (index===0?[11,35,55]:index===1?[12,34,57]:[]).forEach(x=>map[6][x]='Q');
  if(index===0)map[7][24]='P';
  const heroHeight=starsCollected>0?64:44;
  hero={x:start.x,y:start.y-heroHeight,w:34,h:heroHeight,vx:0,vy:0,ground:false,dead:false,invincible:0,crouching:false,facing:1};
  if(index===1)bossDefeated=false;
  camera=0;fireCooldown=0;running=true;paused=false;last=performance.now();nextAction='restart';hideOverlay();updateHud();draw();
  const token=++loopToken;requestAnimationFrame(time=>loop(time,token));
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
  const rewards=['coin','star','star','coin'],type=rewards[openedBlocks++%rewards.length];
  map[ty][tx]='B';
  if(type==='coin'){addCoin();treasures.push({type,x:tx*TILE+12,y:ty*TILE-8,life:.8});tone(880,.09)}
  else{treasures.push({type,x:tx*TILE+10,y:ty*TILE-4,w:28,h:28,life:8,reveal:.4,taken:false});tone(640,.12)}
  updateHud();
}

function update(dt){
  hero.invincible=Math.max(0,hero.invincible-dt);fireCooldown=Math.max(0,fireCooldown-dt);if(keys.down&&hero.ground&&tryPipe())return;updateCrouch();
  hero.vx=(keys.right-keys.left)*(hero.crouching?115:270);if(hero.vx)hero.facing=Math.sign(hero.vx);
  if(keys.jump&&hero.ground){hero.vy=-720;hero.ground=false;tone(420,.05)}
  if(keys.fire)shootFireball();
  physics(hero,dt);if(hero.y>650)return loseLife();
  coins.forEach(coin=>{if(!coin.taken&&overlap(hero,{x:coin.x,y:coin.y,w:24,h:24})){coin.taken=true;addCoin();tone(760,.05)}});
  treasures.forEach(item=>{if(item.reveal>0){item.y-=70*dt;item.reveal-=dt}item.life-=dt;if(item.type==='star'&&!item.taken&&item.reveal<=0&&overlap(hero,item))collectStar(item)});
  treasures=treasures.filter(item=>item.life>0&&!item.taken);
  enemies.forEach(enemy=>updateEnemy(enemy,dt));updateShellHits();updateFireballs(dt);
  if(stage===0){const flagX=map.find(row=>row.includes('F'))?.indexOf('F')*TILE;if(flagX>=0&&hero.x>flagX)enterBossStage()}
  camera=Math.max(0,Math.min(hero.x-300,COLS*TILE-960));updateHud();
}
function addCoin(){coinsCollected++;score+=100;if(coinsCollected>=nextLifeAt){lives++;nextLifeAt+=20;tone(1180,.25)}updateHud()}
function tryPipe(){
  const tx=Math.floor((hero.x+hero.w/2)/TILE),ty=Math.floor((hero.y+hero.h+3)/TILE);if(map[ty]?.[tx]!=='P')return false;
  if(stage===0&&!bonusUsed&&tx===24){bonusUsed=true;running=false;tone(240,.22);loadLevel(2);return true}
  if(stage===2&&tx===50){running=false;tone(360,.22);loadLevel(0);hero.x=48*TILE;hero.y=300;return true}
  return false;
}
function updateCrouch(){
  if(starsCollected<1)return;
  if(keys.down&&hero.ground&&!hero.crouching){const feet=hero.y+hero.h;hero.h=44;hero.y=feet-44;hero.crouching=true}
  if(!keys.down&&hero.crouching){const newY=hero.y-20,left=Math.floor(hero.x/TILE),right=Math.floor((hero.x+hero.w-1)/TILE),top=Math.floor(newY/TILE);if(!solid(left,top)&&!solid(right,top)){hero.y=newY;hero.h=64;hero.crouching=false}}
}
function shootFireball(){
  if(hero.invincible<=2||fireCooldown>0)return;fireCooldown=.32;
  fireballs.push({x:hero.x+(hero.facing>0?hero.w:0),y:hero.y+hero.h*.42,w:16,h:16,vx:hero.facing*430,vy:-120,life:2.2});tone(720,.04);
}
function updateFireballs(dt){
  fireballs.forEach(ball=>{ball.life-=dt;ball.vy+=900*dt;ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;const tx=Math.floor((ball.x+8)/TILE),ty=Math.floor((ball.y+16)/TILE);if(solid(tx,ty)){ball.y=ty*TILE-16;ball.vy=-260}enemies.forEach(enemy=>{if(ball.life>0&&enemy.alive&&overlap(ball,enemy)){ball.life=0;if(enemy.type==='boss'){enemy.hp--;enemy.invincible=.45;if(enemy.hp<=0){enemy.alive=false;winGame()}}else{enemy.alive=false;score+=300}tone(170,.07)}})});fireballs=fireballs.filter(ball=>ball.life>0&&ball.x>camera-50&&ball.x<camera+1050);
}
function updateShellHits(){
  enemies.filter(enemy=>enemy.alive&&enemy.type==='turtle'&&enemy.shell&&Math.abs(enemy.vx)>100).forEach(shell=>enemies.forEach(target=>{if(target===shell||!target.alive||!overlap(shell,target))return;if(target.type==='boss'){target.hp--;target.invincible=.5;shell.vx*=-1;if(target.hp<=0){target.alive=false;winGame()}}else{target.alive=false;score+=300;tone(240,.07)}}));
}
function updateEnemy(enemy,dt){
  if(!enemy.alive)return;enemy.invincible=Math.max(0,enemy.invincible-dt);
  if(enemy.type==='boss'&&!enemy.awake){if(hero.x>50*TILE){enemy.awake=true;enemy.vx=-95;tone(75,.35)}else enemy.vx=0}
  const oldVx=enemy.vx;physics(enemy,dt);if(oldVx&&enemy.vx===0)enemy.vx=-oldVx;
  if(enemy.type==='boss'){if(enemy.x<enemy.patrolMin){enemy.x=enemy.patrolMin;enemy.vx=Math.abs(enemy.vx||95)}if(enemy.x+enemy.w>enemy.patrolMax){enemy.x=enemy.patrolMax-enemy.w;enemy.vx=-Math.abs(enemy.vx||95)}}
  if(enemy.ground&&enemy.type!=='boss'&&!(enemy.type==='turtle'&&enemy.shell&&Math.abs(enemy.vx)>100)){const ahead=enemy.vx>=0?enemy.x+enemy.w+3:enemy.x-3,foot=enemy.y+enemy.h+3;if(!solid(Math.floor(ahead/TILE),Math.floor(foot/TILE)))enemy.vx=enemy.vx>=0?-Math.abs(oldVx||75):Math.abs(oldVx||75)}
  if(enemy.y>650){enemy.alive=false;return}
  if(!overlap(hero,enemy)||hero.dead||enemy.invincible>0)return;
  if(hero.invincible>2&&enemy.type!=='boss'){enemy.alive=false;score+=300;tone(980,.05);return}
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
function collectStar(item){
  item.taken=true;starsCollected++;score+=500;tone(1040,.16);
  if(starsCollected===1){const feet=hero.y+hero.h;hero.h=64;hero.y=feet-hero.h}
  else hero.invincible=10;
  updateHud();
}
function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y}
function enterBossStage(){running=false;nextAction='boss';showOverlay('CASTLE 1–2','魔王關開啟','穿越城堡，踩擊魔王三次來拯救像素世界。','進入魔王關')}
function winGame(){if(bossDefeated)return;bossDefeated=true;running=false;nextAction='restart';score+=2000;showOverlay('ALL CLEAR','冒險成功！',`魔王已被擊敗，最終得到 <b>${score}</b> 分。`,'重新冒險');updateHud()}
function loseLife(){
  if(hero.dead||hero.invincible>0)return;
  if(starsCollected>0){const feet=hero.y+hero.h;starsCollected=0;hero.h=44;hero.y=feet-44;hero.crouching=false;hero.invincible=1.5;hero.vy=-230;tone(150,.18);updateHud();return}
  hero.dead=true;lives--;tone(90,.3);updateHud();
  if(lives<=0){running=false;nextAction='restart';showOverlay('GAME OVER','冒險結束','再試一次，寶物與魔王都在等著你。','重新挑戰');return}
  running=false;
  starsCollected=0;
  setTimeout(()=>{const currentStage=stage;loadLevel(currentStage);hero.invincible=1.5},650);
}

function drawTile(tx,ty,value){
  const px=tx*TILE-camera,py=ty*TILE;
  if(value==='#'){ctx.fillStyle=stage?'#584858':'#9b6033';ctx.fillRect(px,py,TILE,TILE);ctx.fillStyle=stage?'#8f718b':'#d6964c';ctx.fillRect(px,py,TILE,8);ctx.strokeStyle='#4b3030';ctx.strokeRect(px+.5,py+.5,TILE-1,TILE-1)}
  if(value==='B'||value==='Q'){ctx.fillStyle=value==='Q'?'#ffc83d':'#e2793e';ctx.fillRect(px+2,py+2,TILE-4,TILE-4);ctx.fillStyle=value==='Q'?'#7c4c20':'#ffc05b';ctx.font='bold 25px monospace';ctx.textAlign='center';ctx.fillText(value==='Q'?'?':'•',px+24,py+33);ctx.strokeStyle='#743625';ctx.strokeRect(px+2,py+2,TILE-4,TILE-4)}
  if(value==='P'){ctx.fillStyle='#49a654';ctx.fillRect(px+5,py,TILE-10,TILE);ctx.fillStyle='#82e66f';ctx.fillRect(px,py,TILE,10)}
}
function draw(){
  ctx.setTransform(1,0,0,1,0,0);ctx.globalAlpha=1;ctx.clearRect(0,0,960,540);ctx.fillStyle=stage?'#241b32':'#63c9f1';ctx.fillRect(0,0,960,540);
  if(!stage){ctx.fillStyle='#fff';for(let i=0;i<8;i++){let px=(i*190-camera*.18)%1200;if(px<0)px+=1200;ctx.fillRect(px,78+(i%3)*50,70,18);ctx.fillRect(px+18,66+(i%3)*50,35,18)}}
  else if(stage===1){
    const sky=ctx.createLinearGradient(0,0,0,430);sky.addColorStop(0,'#30343b');sky.addColorStop(.55,'#555b63');sky.addColorStop(1,'#7a7f84');ctx.fillStyle=sky;ctx.fillRect(0,0,960,430);
    ctx.fillStyle='#d9dde0';ctx.beginPath();ctx.arc(785,92,48,0,Math.PI*2);ctx.fill();ctx.fillStyle='#30343b';ctx.beginPath();ctx.arc(804,78,45,0,Math.PI*2);ctx.fill();
    const shift=(camera*.18)%220;ctx.fillStyle='#25292e';for(let i=-1;i<7;i++){const bx=i*220-shift;ctx.fillRect(bx,205,150,225);ctx.fillRect(bx+42,155,66,50);ctx.beginPath();ctx.moveTo(bx+42,155);ctx.lineTo(bx+75,110);ctx.lineTo(bx+108,155);ctx.fill();ctx.fillStyle='#b9a86b';for(let wy=235;wy<390;wy+=52){ctx.fillRect(bx+25,wy,16,25);ctx.fillRect(bx+104,wy,16,25)}ctx.fillStyle='#25292e'}
    ctx.fillStyle='#42474d';ctx.fillRect(0,426,960,15);ctx.fillStyle='#737980';for(let i=0;i<18;i++){ctx.beginPath();ctx.arc(i*60-(camera*.35%60),426,18,Math.PI,0);ctx.fill()}
  }else{
    const cave=ctx.createLinearGradient(0,0,0,540);cave.addColorStop(0,'#102d3b');cave.addColorStop(1,'#06171f');ctx.fillStyle=cave;ctx.fillRect(0,0,960,540);
    ctx.fillStyle='#1d4b59';for(let y=18;y<430;y+=54)for(let x=-40;x<1000;x+=90){const offset=(Math.floor(y/54)%2)*44;ctx.fillRect(x+offset-(camera*.08%90),y,72,32)}
    ctx.fillStyle='#4f8790';ctx.fillRect(0,420,960,18);ctx.fillStyle='#8ed9d2';ctx.font='bold 16px monospace';ctx.textAlign='left';ctx.fillText('BONUS CAVE · 收集金幣後從右側水管離開',24,38);
  }
  map.forEach((row,y)=>row.forEach((value,x)=>value!==' '&&value!=='F'&&drawTile(x,y,value)));
  coins.forEach((coin,i)=>{if(coin.taken)return;ctx.fillStyle='#ffd43b';ctx.beginPath();ctx.ellipse(coin.x+12-camera,coin.y+12,7+Math.sin(performance.now()/150+i)*3,12,0,0,7);ctx.fill()});
  treasures.forEach(item=>{ctx.fillStyle=item.type==='coin'?'#ffd43b':'#fff36b';ctx.font=item.type==='coin'?'24px serif':'27px serif';ctx.fillText(item.type==='coin'?'●':'★',item.x-camera,item.y)});
  fireballs.forEach(ball=>{ctx.fillStyle='#ffed57';ctx.shadowColor='#ff6b35';ctx.shadowBlur=12;ctx.beginPath();ctx.arc(ball.x-camera+8,ball.y+8,8,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0});
  enemies.forEach(drawEnemy);drawFlag();drawBossHealth();drawHero();
}
function drawEnemy(enemy){
  if(!enemy.alive||enemy.invincible>0&&Math.floor(enemy.invincible*12)%2)return;const px=enemy.x-camera;
  if(enemy.type==='walker'){ctx.fillStyle='#623b35';ctx.fillRect(px,enemy.y+10,enemy.w,enemy.h-10)}
  if(enemy.type==='turtle'){ctx.fillStyle='#276f3b';ctx.beginPath();ctx.ellipse(px+enemy.w/2,enemy.y+enemy.h/2,enemy.w/2,enemy.h/2,0,0,7);ctx.fill();ctx.strokeStyle='#9ce35e';ctx.lineWidth=3;ctx.beginPath();ctx.arc(px+enemy.w/2,enemy.y+enemy.h/2,enemy.w*.28,0,Math.PI*2);ctx.stroke();if(!enemy.shell){ctx.fillStyle='#d9ef8b';ctx.beginPath();ctx.arc(px+(enemy.vx>0?enemy.w-4:4),enemy.y+5,10,0,Math.PI*2);ctx.fill();ctx.fillStyle='#17251b';ctx.fillRect(px+(enemy.vx>0?enemy.w-1:1),enemy.y+2,3,4);ctx.fillStyle='#e3b55b';ctx.fillRect(px+4,enemy.y+enemy.h-3,11,6);ctx.fillRect(px+enemy.w-15,enemy.y+enemy.h-3,11,6)}}
  if(enemy.type==='boss'){ctx.fillStyle='#792fa8';ctx.fillRect(px+5,enemy.y+20,enemy.w-10,enemy.h-20);ctx.fillStyle='#b84fda';ctx.fillRect(px,enemy.y+34,enemy.w,enemy.h-40);ctx.fillStyle='#ffd447';ctx.fillRect(px+8,enemy.y+8,enemy.w-16,20);ctx.fillStyle='#fff';ctx.fillRect(px+15,enemy.y+34,13,13);ctx.fillRect(px+enemy.w-28,enemy.y+34,13,13);ctx.fillStyle='#161020';ctx.fillRect(px+20,enemy.y+38,5,7);ctx.fillRect(px+enemy.w-25,enemy.y+38,5,7);ctx.fillStyle='#ef4b3f';ctx.beginPath();ctx.moveTo(px+12,enemy.y+10);ctx.lineTo(px+20,enemy.y-12);ctx.lineTo(px+29,enemy.y+10);ctx.fill();ctx.beginPath();ctx.moveTo(px+enemy.w-29,enemy.y+10);ctx.lineTo(px+enemy.w-20,enemy.y-12);ctx.lineTo(px+enemy.w-12,enemy.y+10);ctx.fill()}
  if(enemy.type!=='turtle'||!enemy.shell){ctx.fillStyle='#111';ctx.fillRect(px+10,enemy.y+17,4,6);ctx.fillRect(px+enemy.w-14,enemy.y+17,4,6)}
}
function drawBossHealth(){const boss=enemies.find(enemy=>enemy.type==='boss'&&enemy.alive);if(!boss||stage!==1)return;ctx.fillStyle='#120d19cc';ctx.fillRect(330,18,300,34);ctx.fillStyle='#ef4b62';ctx.fillRect(338,26,284*(boss.hp/3),18);ctx.strokeStyle='#ffd447';ctx.strokeRect(338,26,284,18);ctx.fillStyle='#fff';ctx.font='bold 12px monospace';ctx.textAlign='center';ctx.fillText(`魔王 HP ${boss.hp}/3`,480,39)}
function drawFlag(){if(stage!==0)return;const row=map.find(r=>r.includes('F'));if(!row)return;const fx=row.indexOf('F')*TILE-camera;ctx.fillStyle='#eee';ctx.fillRect(fx,110,6,330);ctx.fillStyle='#ef4b3f';ctx.fillRect(fx+6,118,76,45);ctx.fillStyle='#ffd447';ctx.fillRect(fx+17,130,17,17)}
function drawHero(){if(hero.dead)return;const px=hero.x-camera,big=hero.h>44&&!hero.crouching,flash=hero.invincible>2,dir=hero.facing;ctx.globalAlpha=hero.invincible>0&&Math.floor(hero.invincible*12)%2?.45:1;const red=flash?`hsl(${performance.now()/4%360} 90% 62%)`:'#e9443f',blue=flash?'#fff36b':'#24558e';ctx.fillStyle=red;ctx.fillRect(px+4,hero.y,26,big?15:12);ctx.fillRect(px+(dir>0?1:22),hero.y+6,11,5);ctx.fillStyle='#5a2d24';ctx.fillRect(px+(dir>0?5:23),hero.y+3,6,7);ctx.fillStyle='#ffd39b';ctx.fillRect(px+6,hero.y+(big?15:12),23,big?20:14);ctx.fillStyle='#5a2d24';ctx.fillRect(px+(dir>0?23:7),hero.y+(big?20:17),4,6);ctx.fillStyle=blue;ctx.fillRect(px+3,hero.y+(big?35:26),28,big?20:14);ctx.fillStyle=red;ctx.fillRect(px+3,hero.y+(big?38:28),6,big?16:11);ctx.fillRect(px+25,hero.y+(big?38:28),6,big?16:11);ctx.fillStyle='#39251e';ctx.fillRect(px+1,hero.y+hero.h-7,12,7);ctx.fillRect(px+21,hero.y+hero.h-7,12,7);ctx.globalAlpha=1}
function loop(time,token){if(!running||token!==loopToken)return;const dt=Math.min((time-last)/1000,.03);last=time;if(!paused)update(dt);draw();requestAnimationFrame(next=>loop(next,token))}
function updateHud(){$('#score').textContent=String(score).padStart(6,'0');$('#coins').textContent=String(coinsCollected).padStart(2,'0');$('#lives').textContent='♥'.repeat(Math.max(lives,0))}
function showOverlay(kicker,title,message,button){$('#kicker').textContent=kicker;$('#title').textContent=title;$('#message').innerHTML=message;$('#start').textContent=button;$('#overlay').classList.remove('hidden')}
function hideOverlay(){$('#overlay').classList.add('hidden')}
function tone(frequency,duration){audio??=new AudioContext();const oscillator=audio.createOscillator(),gain=audio.createGain();oscillator.type='square';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.025,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);oscillator.connect(gain).connect(audio.destination);oscillator.start();oscillator.stop(audio.currentTime+duration)}
function press(key,value){keys[key]=value}
document.addEventListener('keydown',event=>{const controls={arrowleft:'left',a:'left',arrowright:'right',d:'right',arrowup:'jump',w:'jump',' ':'jump',arrowdown:'down',s:'down',x:'fire',f:'fire'},key=controls[event.key.toLowerCase()];if(key){event.preventDefault();press(key,true)}if(event.key.toLowerCase()==='p'&&running){paused=!paused;paused?showOverlay('PAUSED','遊戲暫停','按 P 繼續冒險。','繼續'):hideOverlay()}});
document.addEventListener('keyup',event=>{const controls={arrowleft:'left',a:'left',arrowright:'right',d:'right',arrowup:'jump',w:'jump',' ':'jump',arrowdown:'down',s:'down',x:'fire',f:'fire'},key=controls[event.key.toLowerCase()];if(key)press(key,false)});
document.querySelectorAll('[data-key]').forEach(button=>{button.onpointerdown=event=>{event.preventDefault();press(button.dataset.key,true)};button.onpointerup=button.onpointercancel=()=>press(button.dataset.key,false)});
$('#start').onclick=()=>{if(paused){paused=false;hideOverlay()}else if(nextAction==='boss')loadLevel(1);else resetGame()};
map=LEVELS[0].map(row=>row.padEnd(COLS).slice(0,COLS).split(''));hero={x:96,y:300,w:34,h:44,dead:false,invincible:0};draw();updateHud();
