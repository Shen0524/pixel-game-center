const COLS=10,ROWS=20,SIZE=30;
const COLORS={I:'#52e5ff',J:'#5b78ff',L:'#ff9d3d',O:'#ffe052',S:'#5bef88',T:'#bd6cff',Z:'#ff5277'};
const SHAPES={I:[[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],J:[[1,0,0],[1,1,1],[0,0,0]],L:[[0,0,1],[1,1,1],[0,0,0]],O:[[1,1],[1,1]],S:[[0,1,1],[1,1,0],[0,0,0]],T:[[0,1,0],[1,1,1],[0,0,0]],Z:[[1,1,0],[0,1,1],[0,0,0]]};
const canvas=document.querySelector('#board'),ctx=canvas.getContext('2d'),nextCtx=document.querySelector('#next').getContext('2d'),holdCtx=document.querySelector('#hold').getContext('2d');
const $=s=>document.querySelector(s);let board,piece,next,held=null,canHold=true,bag=[],score=0,lines=0,level=1,playing=false,paused=false,last=0,dropCounter=0,soundOn=true;
const high=()=>Number(localStorage.getItem('neonBlocksHigh')||0);
function emptyBoard(){return Array.from({length:ROWS},()=>Array(COLS).fill(null))}
function takeType(){if(!bag.length)bag=Object.keys(SHAPES).sort(()=>Math.random()-.5);return bag.pop()}
function makePiece(type=takeType()){return{type,matrix:SHAPES[type].map(r=>[...r]),x:Math.floor((COLS-SHAPES[type][0].length)/2),y:-1}}
function reset(){board=emptyBoard();bag=[];piece=makePiece();next=makePiece();held=null;score=lines=0;level=1;canHold=true;playing=true;paused=false;last=performance.now();dropCounter=0;updateUI();hideOverlay();requestAnimationFrame(loop)}
function collide(p=piece){return p.matrix.some((row,y)=>row.some((v,x)=>v&&(p.y+y>=ROWS||p.x+x<0||p.x+x>=COLS||(p.y+y>=0&&board[p.y+y][p.x+x]))))}
function move(dx,dy){if(!playing||paused)return false;piece.x+=dx;piece.y+=dy;if(collide()){piece.x-=dx;piece.y-=dy;return false}return true}
function rotate(){if(!playing||paused)return;const old=piece.matrix;piece.matrix=piece.matrix[0].map((_,i)=>piece.matrix.map(r=>r[i]).reverse());for(const kick of [0,-1,1,-2,2]){piece.x+=kick;if(!collide()){beep(520,.035);return}piece.x-=kick}piece.matrix=old}
function lock(){if(piece.matrix.some((r,y)=>r.some(v=>v&&piece.y+y<0)))return gameOver();piece.matrix.forEach((r,y)=>r.forEach((v,x)=>{if(v)board[piece.y+y][piece.x+x]=piece.type}));clearLines();piece=next;next=makePiece();canHold=true;if(collide())return gameOver();updateUI();beep(180,.045)}
function step(){if(!move(0,1))lock();dropCounter=0}
function hardDrop(){if(!playing||paused)return;let d=0;while(move(0,1))d++;score+=d*2;beep(760,.04);lock()}
function clearLines(){let count=0;for(let y=ROWS-1;y>=0;y--){if(board[y].every(Boolean)){board.splice(y,1);board.unshift(Array(COLS).fill(null));count++;y++}}if(count){lines+=count;score+=[0,100,300,500,800][count]*level;level=Math.floor(lines/10)+1;beep(900,.1)}}
function hold(){if(!playing||paused||!canHold)return;const t=piece.type;if(held){piece=makePiece(held)}else{piece=next;next=makePiece()}held=t;canHold=false;beep(420,.05);updateUI()}
function ghostY(){const p={...piece,y:piece.y};while(!collide(p))p.y++;return p.y-1}
function cell(c,x,y,alpha=1,context=ctx,size=SIZE){if(y<0)return;context.globalAlpha=alpha;context.fillStyle=COLORS[c];context.fillRect(x*size+2,y*size+2,size-4,size-4);context.fillStyle='#fff';context.globalAlpha=alpha*.22;context.fillRect(x*size+3,y*size+3,size-6,4);context.strokeStyle='#fff';context.globalAlpha=alpha*.13;context.strokeRect(x*size+2.5,y*size+2.5,size-5,size-5);context.globalAlpha=1}
function ghostCell(c,x,y){if(y<0)return;ctx.save();ctx.strokeStyle=COLORS[c];ctx.globalAlpha=.48;ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.strokeRect(x*SIZE+5,y*SIZE+5,SIZE-10,SIZE-10);ctx.restore()}
function draw(){ctx.fillStyle='#070912';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#161b2c';ctx.lineWidth=1;for(let x=1;x<COLS;x++){ctx.beginPath();ctx.moveTo(x*SIZE,0);ctx.lineTo(x*SIZE,600);ctx.stroke()}for(let y=1;y<ROWS;y++){ctx.beginPath();ctx.moveTo(0,y*SIZE);ctx.lineTo(300,y*SIZE);ctx.stroke()}board.forEach((r,y)=>r.forEach((c,x)=>c&&cell(c,x,y)));if(piece&&playing){const landingY=ghostY();if(landingY!==piece.y)piece.matrix.forEach((r,y)=>r.forEach((v,x)=>v&&ghostCell(piece.type,piece.x+x,landingY+y)));piece.matrix.forEach((r,y)=>r.forEach((v,x)=>v&&cell(piece.type,piece.x+x,piece.y+y)))}}
function preview(context,p){context.clearRect(0,0,120,100);if(!p)return;const s=22,w=p.matrix[0].length*s,h=p.matrix.length*s,ox=(120-w)/2,oy=(100-h)/2;p.matrix.forEach((r,y)=>r.forEach((v,x)=>{if(v){context.fillStyle=COLORS[p.type];context.fillRect(ox+x*s+2,oy+y*s+2,s-4,s-4)}}))}
function updateUI(){$('#score').textContent=score.toLocaleString();$('#lines').textContent=lines;$('#level').textContent=level;$('#highScore').textContent=Math.max(score,high()).toLocaleString();preview(nextCtx,next);preview(holdCtx,held?makePiece(held):null)}
function loop(t){if(!playing)return;const dt=t-last;last=t;if(!paused){dropCounter+=dt;if(dropCounter>Math.max(90,850-(level-1)*65))step();draw()}requestAnimationFrame(loop)}
function overlay(title,text,button='再玩一次'){$('#overlayTitle').textContent=title;$('#overlayText').textContent=text;$('#startBtn').textContent=button;$('#overlay').classList.remove('hidden')}
function hideOverlay(){$('#overlay').classList.add('hidden')}
function gameOver(){playing=false;localStorage.setItem('neonBlocksHigh',Math.max(score,high()));updateUI();draw();overlay('遊戲結束',`本次得到 ${score.toLocaleString()} 分，消除了 ${lines} 行。`);beep(90,.35)}
function togglePause(){if(!playing)return;paused=!paused;if(paused)overlay('已暫停','休息一下，準備好再繼續。','繼續');else hideOverlay()}
let audio;function beep(freq,duration){if(!soundOn)return;audio??=new AudioContext();const o=audio.createOscillator(),g=audio.createGain();o.frequency.value=freq;o.type='square';g.gain.setValueAtTime(.025,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+duration);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+duration)}
$('#startBtn').onclick=()=>paused?togglePause():reset();$('#soundBtn').onclick=()=>{soundOn=!soundOn;$('#soundBtn').textContent=`音效：${soundOn?'開':'關'}`};
document.addEventListener('keydown',e=>{const keys=['ArrowLeft','ArrowRight','ArrowDown','ArrowUp',' '];if(keys.includes(e.key))e.preventDefault();if(e.key==='ArrowLeft')move(-1,0);if(e.key==='ArrowRight')move(1,0);if(e.key==='ArrowDown'){if(move(0,1))score++;updateUI()}if(e.key==='ArrowUp')rotate();if(e.key===' ')hardDrop();if(e.key.toLowerCase()==='c')hold();if(e.key.toLowerCase()==='p')togglePause();draw()});
document.querySelectorAll('[data-action]').forEach(b=>{b.addEventListener('pointerdown',e=>{e.preventDefault();({left:()=>move(-1,0),right:()=>move(1,0),down:()=>move(0,1),rotate,drop:hardDrop,hold}[b.dataset.action])();draw()})});
board=emptyBoard();next=makePiece();updateUI();draw();
