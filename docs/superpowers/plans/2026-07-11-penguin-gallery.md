# ぺんぎん展示室（氷の国 3Dポスター展示室）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A4ポスター（PDF/画像）を提出すると氷の国の円形回廊に自動額装され、みんながブラウザで歩いて鑑賞できる単一ページ3Dアプリを作る。

**Architecture:** rowke `art-feedback/gallery.html` を土台に、単一HTML＋Vanilla JS＋Three.js(CDN)で `penguin-gallery/index.html` を新規構築。提出画像はブラウザ内でPDF.jsによる画像化＋長辺2000pxリサイズ後 Firebase Storage(`penguin/`)へ、メタは Realtime DB(`penguin/exhibits`)へ保存。既存rowkeデータには触れず`penguin/`パスに完全隔離。

**Tech Stack:** Three.js `0.160.0`(unpkg) / pd.js `pdfjs-dist@4`(cdnjs) / firebase compat `10.12.2`(app+database+storage) / Vercel(新規プロジェクト)

## Global Constraints

- 単一HTMLファイル構成。CSS/JSはインライン。バンドラー・npm依存を追加しない（CDNのみ）。
- 3Dは Three.js `https://unpkg.com/three@0.160.0/build/three.min.js`。
- Firebaseは rowke-app プロジェクトを流用: `apiKey:"AIzaSyBaHdrESJGmNEPCBOh_XlOjgy_4lhFg5LE"`, `authDomain:"rowke-app.firebaseapp.com"`, `databaseURL:"https://rowke-app-default-rtdb.asia-southeast1.firebasedatabase.app"`, `projectId:"rowke-app"`, `storageBucket:"rowke-app.firebasestorage.app"`, `messagingSenderId:"950459153761"`, `appId:"1:950459153761:web:ea18c5d7cb55ed589a9920"`。
- データは **`penguin/` パスのみ** に読み書きする。`art/` 等の既存パスには一切触れない。
- 画像アップロード上限 **15MB**、保存前に**長辺2000px**へ自動リサイズ。ファイルは PDF/PNG/JPEG のみ。
- リンクは `https://` で始まるもののみ表示・オープン可（`esc()`＋プロトコル検証）。
- 検証は各タスクで **headless Chrome**（`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless=new --screenshot`）でレンダリングし、スクショ目視＋コンソールエラー無しを確認する（この codebase に単体テスト基盤は無い）。

---

## ファイル構成

- Create: `penguin-gallery/index.html` — 単一HTML（3D展示＋提出＋鑑賞＋苺＋管理モーダル）。全機能をここに実装する。
- Create: `penguin-gallery/vercel.json` — 静的配信の最小設定（任意）。
- 補助: `/tmp/pg_*.png`（headless検証のスクショ出力先、コミットしない）。

管理UIは規模が小さいため別ファイルにせず index 内モーダル（`#admin`）に含める。

---

### Task 1: 足場＋Firebase初期化＋氷の床と空

**Files:**
- Create: `penguin-gallery/index.html`

**Interfaces:**
- Produces: グローバル `scene, camera, renderer`（Three.js）／`db`(firebase.database())／`storage`(firebase.storage())／`fbReady`(bool)。`animate()` ループ稼働。`penguin/` パスのみ使用。

- [ ] **Step 1: index.html を作成（HTML骨格＋CDN＋Firebase init＋氷の空間）**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>ぺんぎん展示室 — 氷の国</title>
<style>
  *{box-sizing:border-box;margin:0;-webkit-tap-highlight-color:transparent;}
  html,body{height:100%;overflow:hidden;background:#0a1826;font-family:'Hiragino Sans','Yu Gothic',sans-serif;color:#eaf6ff;}
  #c{display:block;width:100%;height:100%;}
</style>
<script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-database-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js"></script>
</head>
<body>
<canvas id="c"></canvas>
<script>
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || ('ontouchstart' in window && innerWidth<900);
let fbReady=false, db=null, storage=null;
try{
  firebase.initializeApp({
    apiKey:"AIzaSyBaHdrESJGmNEPCBOh_XlOjgy_4lhFg5LE", authDomain:"rowke-app.firebaseapp.com",
    databaseURL:"https://rowke-app-default-rtdb.asia-southeast1.firebasedatabase.app", projectId:"rowke-app",
    storageBucket:"rowke-app.firebasestorage.app", messagingSenderId:"950459153761", appId:"1:950459153761:web:ea18c5d7cb55ed589a9920"
  });
  db=firebase.database(); storage=firebase.storage(); fbReady=true;
}catch(e){ console.error('firebase init failed', e); }

let scene,camera,renderer;
const RADIUS_BASE=14, FRAME_ARC=4.2; // 額1枚あたりの円周上の間隔(m)
function initScene(){
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0x0a1826);
  scene.fog=new THREE.Fog(0x0a1826, 26, 90);
  camera=new THREE.PerspectiveCamera(70, innerWidth/innerHeight, 0.1, 400);
  camera.position.set(0,1.6,RADIUS_BASE-4);
  renderer=new THREE.WebGLRenderer({canvas:document.getElementById('c'),antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setSize(innerWidth,innerHeight);
  // 照明（寒色）
  scene.add(new THREE.HemisphereLight(0xcfe8ff, 0x1a3350, 0.9));
  const dir=new THREE.DirectionalLight(0xffffff,0.6); dir.position.set(8,20,6); scene.add(dir);
  // 凍った床（薄く反射する寒色）
  const floor=new THREE.Mesh(new THREE.CircleGeometry(120,64),
    new THREE.MeshStandardMaterial({color:0x16324a,roughness:0.35,metalness:0.1}));
  floor.rotation.x=-Math.PI/2; floor.position.y=0; scene.add(floor);
  // 中央の氷山（目印）
  const berg=new THREE.Mesh(new THREE.ConeGeometry(4.5,9,6),
    new THREE.MeshStandardMaterial({color:0xbfe6ff,roughness:0.5,flatShading:true}));
  berg.position.set(0,4.5,0); scene.add(berg);
  addEventListener('resize',()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });
  animate();
}
function animate(){ requestAnimationFrame(animate); renderer.render(scene,camera); }
initScene();
</script>
</body>
</html>
```

- [ ] **Step 2: headless でレンダリング検証**

Run:
```bash
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; cd penguin-gallery
"$CH" --headless=new --disable-gpu --window-size=1000,700 --screenshot="/tmp/pg_t1.png" "file://$PWD/index.html" 2>/dev/null; ls -la /tmp/pg_t1.png
```
Expected: `/tmp/pg_t1.png` が生成され、氷の床・中央の氷山が寒色で描画されている（目視）。

- [ ] **Step 3: コミット**

```bash
git add penguin-gallery/index.html
git commit -m "penguin-gallery: scaffold ice scene + firebase(penguin/) init"
```

---

### Task 2: 円形回廊の額配置（モックデータ）＋人数で半径自動調整

**Files:**
- Modify: `penguin-gallery/index.html`

**Interfaces:**
- Consumes: `scene`, `RADIUS_BASE`, `FRAME_ARC`。
- Produces: `frames[]`（各 `{mesh, data, pos:THREE.Vector3, picMesh|null}`）／`radiusFor(n)`→number／`layoutExhibits(list)`（listは `{id,productName,author,link,highlight,imageUrl}` の配列）。額はA4縦比率(1:1.414)で円周に内向き配置。

- [ ] **Step 1: 配置ロジックを追加**

`initScene()` の末尾 `animate();` の直前に呼ぶ形で、以下を `<script>` に追加:

```js
let frames=[];
function radiusFor(n){ return Math.max(RADIUS_BASE, (Math.max(n,1)*FRAME_ARC)/(2*Math.PI)); }
function clearFrames(){ frames.forEach(f=>{ scene.remove(f.mesh); if(f.picMesh) scene.remove(f.picMesh); }); frames=[]; }
function layoutExhibits(list){
  clearFrames();
  const n=list.length, R=radiusFor(n);
  const FW=2.2, FH=FW*1.414; // A4縦の額サイズ(m)
  list.forEach((d,i)=>{
    const ang=(i/Math.max(n,1))*Math.PI*2;
    const x=Math.sin(ang)*R, z=Math.cos(ang)*R;
    const frame=new THREE.Mesh(new THREE.BoxGeometry(FW+0.22,FH+0.22,0.14),
      new THREE.MeshStandardMaterial({color:0xdff2ff,roughness:0.4}));
    frame.position.set(x,FH/2+0.6,z);
    frame.lookAt(0,FH/2+0.6,0); // 中央（内向き）
    scene.add(frame);
    frames.push({mesh:frame,data:d,pos:frame.position.clone(),picMesh:null,ang});
  });
}
// 動作確認用モック（Task3で実データに差し替え）
if(new URLSearchParams(location.search).get('mock')){
  layoutExhibits(Array.from({length:8},(_,i)=>({id:'m'+i,productName:'Product'+i,author:'Name'+i,link:'',highlight:'',imageUrl:''})));
}
```

- [ ] **Step 2: headless 検証（mock付き）**

Run:
```bash
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; cd penguin-gallery
"$CH" --headless=new --disable-gpu --window-size=1000,700 --screenshot="/tmp/pg_t2.png" "file://$PWD/index.html?mock=1" 2>/dev/null; ls -la /tmp/pg_t2.png
```
Expected: 中央氷山の周りに8枚の白い額が円形に並ぶ（目視）。

- [ ] **Step 3: コミット**

```bash
git add penguin-gallery/index.html
git commit -m "penguin-gallery: circular corridor frame layout + auto radius"
```

---

### Task 3: RTDBから展示を購読・画像を遅延読み込み

**Files:**
- Modify: `penguin-gallery/index.html`

**Interfaces:**
- Consumes: `db`, `layoutExhibits`, `frames`。
- Produces: `subscribeExhibits()`（`penguin/exhibits` を `.on('value')` で購読→`layoutExhibits`）／`loadFrameImage(f)`（`f.data.imageUrl` を TextureLoader で読み、額前面に板ポリ `f.picMesh` を貼る）。exhibit shape: `{productName,author,link,highlight,imageUrl,ts}`。

- [ ] **Step 1: 購読＋画像貼り付けを追加**

```js
const texLoader=new THREE.TextureLoader();
function loadFrameImage(f){
  if(!f.data.imageUrl || f.picMesh) return;
  texLoader.load(f.data.imageUrl,(tex)=>{
    tex.colorSpace=THREE.SRGBColorSpace;
    const FW=2.2, FH=FW*1.414;
    const pic=new THREE.Mesh(new THREE.PlaneGeometry(FW,FH), new THREE.MeshBasicMaterial({map:tex}));
    pic.position.copy(f.mesh.position); pic.quaternion.copy(f.mesh.quaternion);
    pic.translateZ(0.09); // 額の前面へ
    scene.add(pic); f.picMesh=pic;
  });
}
function subscribeExhibits(){
  if(!fbReady) return;
  db.ref('penguin/exhibits').on('value',snap=>{
    const val=snap.val()||{};
    const list=Object.entries(val).map(([id,d])=>({id,...d})).sort((a,b)=>(a.ts||0)-(b.ts||0));
    layoutExhibits(list);
    frames.forEach(loadFrameImage); // 近い順の最適化はTask後半で
  });
}
subscribeExhibits();
```

- [ ] **Step 2: 手動投入で検証（一時的にRTDBへ1件push）**

Run（Storage不要、公開画像URLで確認）:
```bash
node -e "const https=require('https');const url='https://rowke-app-default-rtdb.asia-southeast1.firebasedatabase.app/penguin/exhibits/_t3test.json';const body=JSON.stringify({productName:'rowke',author:'FLOTAN',link:'https://art-feedback.vercel.app',highlight:'失敗と学びに注目',imageUrl:'https://art-feedback.vercel.app/wake-sensei.png',ts:Date.now()});const req=https.request(url,{method:'PUT',headers:{'Content-Type':'application/json'}},r=>{let d='';r.on('data',c=>d+=c);r.on('end',()=>console.log('status',r.statusCode,d.slice(0,80)))});req.write(body);req.end();"
```
Expected: `status 200`（ルールが開いていれば）。※ルール未開放なら 401 → Task 9 で `penguin/` を開ける。開放後に再実行。

Run（描画確認）:
```bash
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; cd penguin-gallery
"$CH" --headless=new --disable-gpu --window-size=1000,700 --screenshot="/tmp/pg_t3.png" "file://$PWD/index.html" 2>/dev/null; ls -la /tmp/pg_t3.png
```
Expected: 額に画像が貼られている（wake-sensei）。※検証後 `penguin/exhibits/_t3test` は削除。

- [ ] **Step 3: 検証データ削除＋コミット**

```bash
curl -s -X DELETE "https://rowke-app-default-rtdb.asia-southeast1.firebasedatabase.app/penguin/exhibits/_t3test.json" >/dev/null
git add penguin-gallery/index.html
git commit -m "penguin-gallery: subscribe exhibits from RTDB and render poster images"
```

---

### Task 4: 操作（ドラッグ視点＋WASD/矢印＋モバイル進む）と円内移動制限

**Files:**
- Modify: `penguin-gallery/index.html`

**Interfaces:**
- Consumes: `camera`, `isMobile`, `animate`。
- Produces: `setupControls()`／`animate()` 内で `yaw,pitch,move,keys` を反映。カメラは半径 `radiusFor(n)+3` 以内に制限し `y=1.6` 固定。rowke gallery.html の controls を流用。

- [ ] **Step 1: rowke gallery.html の controls を移植**

`<body>` に追加:
```html
<div id="touch" style="position:fixed;inset:0;display:none;"></div>
<button id="fwd" style="position:fixed;right:20px;bottom:40px;width:78px;height:78px;border-radius:50%;background:rgba(120,200,255,.2);border:2px solid rgba(160,220,255,.6);color:#dff2ff;font-weight:700;display:none;align-items:center;justify-content:center;font-family:inherit;z-index:9;">▲<br>進む</button>
```
`<script>` に追加（rowke 準拠）:
```js
let yaw=0,pitch=0,move=false; const keys={};
if(isMobile){ document.body.classList.add('mobile'); document.getElementById('touch').style.display='block'; document.getElementById('fwd').style.display='flex'; }
function setupControls(){
  if(!isMobile){
    addEventListener('keydown',e=>keys[e.key.toLowerCase()]=true);
    addEventListener('keyup',e=>keys[e.key.toLowerCase()]=false);
    const cv=document.getElementById('c'); let down=false,lx=0,ly=0; cv.style.cursor='grab';
    cv.addEventListener('mousedown',e=>{down=true;lx=e.clientX;ly=e.clientY;cv.style.cursor='grabbing';});
    addEventListener('mouseup',()=>{down=false;cv.style.cursor='grab';});
    addEventListener('mousemove',e=>{ if(!down)return; yaw-=(e.clientX-lx)*0.004; pitch-=(e.clientY-ly)*0.004; pitch=Math.max(-1.2,Math.min(1.2,pitch)); lx=e.clientX; ly=e.clientY; });
  } else {
    const t=document.getElementById('touch'); let lx=0,ly=0,drag=false;
    t.addEventListener('touchstart',e=>{drag=true;lx=e.touches[0].clientX;ly=e.touches[0].clientY;},{passive:true});
    t.addEventListener('touchmove',e=>{ if(!drag)return; const x=e.touches[0].clientX,y=e.touches[0].clientY; yaw-=(x-lx)*0.005; pitch-=(y-ly)*0.005; pitch=Math.max(-1.2,Math.min(1.2,pitch)); lx=x;ly=y; },{passive:true});
    t.addEventListener('touchend',()=>drag=false);
    const f=document.getElementById('fwd'); const on=()=>move=true,off=()=>move=false;
    f.addEventListener('touchstart',e=>{e.preventDefault();on();}); f.addEventListener('touchend',off); f.addEventListener('touchcancel',off);
  }
}
const _fwd=new THREE.Vector3(), _right=new THREE.Vector3();
```
`animate()` を差し替え:
```js
function animate(){
  requestAnimationFrame(animate);
  camera.rotation.order='YXZ'; camera.rotation.y=yaw; camera.rotation.x=pitch;
  _fwd.set(-Math.sin(yaw),0,-Math.cos(yaw)); _right.set(Math.cos(yaw),0,-Math.sin(yaw));
  const sp=0.14;
  if(keys['w']||keys['arrowup']||move) camera.position.addScaledVector(_fwd,sp);
  if(keys['s']||keys['arrowdown']) camera.position.addScaledVector(_fwd,-sp);
  if(keys['a']||keys['arrowleft']) camera.position.addScaledVector(_right,-sp);
  if(keys['d']||keys['arrowright']) camera.position.addScaledVector(_right,sp);
  const lim=radiusFor(frames.length)+3; const d=Math.hypot(camera.position.x,camera.position.z);
  if(d>lim){ camera.position.x*=lim/d; camera.position.z*=lim/d; }
  camera.position.y=1.6;
  renderer.render(scene,camera);
}
setupControls();
```

- [ ] **Step 2: headless で初期描画にエラーが無いか（スクショ）**

Run:
```bash
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; cd penguin-gallery
"$CH" --headless=new --disable-gpu --window-size=1000,700 --screenshot="/tmp/pg_t4.png" "file://$PWD/index.html?mock=1" 2>/dev/null; ls -la /tmp/pg_t4.png
```
Expected: 額が並び、初期視点で描画される（操作は実ブラウザで手動確認）。

- [ ] **Step 3: コミット**

```bash
git add penguin-gallery/index.html
git commit -m "penguin-gallery: drag-look + WASD/mobile controls, clamp inside circle"
```

---

### Task 5: 近接キャプション（プロダクト名・名前・見てほしいポイント・リンク）

**Files:**
- Modify: `penguin-gallery/index.html`

**Interfaces:**
- Consumes: `frames`, `camera`, `animate`。
- Produces: `nearFrame`（近接中の frame or null）／`#peek`(近づくと出るボタン)／`#info`(キャプションパネル)／`openInfo() closeInfo() fillInfo(d)`／`esc(s) safeLink(u)`。animate内で最寄り額(距離<5.5)を判定し `#peek` 表示切替。

- [ ] **Step 1: キャプションUIとロジックを追加**

`<body>` に追加:
```html
<button id="peek" onclick="openInfo()" style="position:fixed;left:50%;bottom:96px;transform:translateX(-50%);z-index:9;display:none;background:linear-gradient(120deg,#7fd6ff,#4b9fe0);color:#06283d;font-weight:700;border:none;padding:12px 24px;border-radius:999px;cursor:pointer;font-family:inherit;">キャプションを見る</button>
<div id="info" style="position:fixed;left:50%;bottom:24px;transform:translate(-50%,16px);z-index:15;width:min(92%,520px);max-height:58vh;overflow:auto;-webkit-overflow-scrolling:touch;background:rgba(8,26,42,.92);backdrop-filter:blur(12px);border:1px solid rgba(160,220,255,.3);border-radius:18px;padding:16px;opacity:0;pointer-events:none;transition:opacity .3s,transform .35s;text-align:left;">
  <button onclick="closeInfo()" style="position:absolute;top:10px;right:12px;width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);color:#fff;cursor:pointer;">✕</button>
  <div class="pt" style="font-size:17px;font-weight:800;padding-right:34px;"></div>
  <div class="pa" style="font-size:13px;color:#9fd0ee;margin-top:2px;"></div>
  <div class="ph" style="font-size:13px;line-height:1.7;margin-top:10px;color:#dcefff;"></div>
  <div class="pl" style="margin-top:12px;"></div>
</div>
```
`<script>` に追加:
```js
const info=document.getElementById('info');
function esc(s){return (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function safeLink(u){ return /^https:\/\//i.test(u||'') ? u : ''; }
let nearFrame=null;
function fillInfo(d){
  info.querySelector('.pt').textContent=d.productName||'無題';
  info.querySelector('.pa').textContent=d.author?('— '+d.author):'';
  info.querySelector('.ph').textContent=d.highlight||'';
  const url=safeLink(d.link);
  info.querySelector('.pl').innerHTML = url
    ? `<a href="${esc(url)}" target="_blank" rel="noopener" style="display:inline-block;background:rgba(127,214,255,.2);border:1px solid rgba(127,214,255,.5);color:#dff2ff;padding:8px 16px;border-radius:999px;text-decoration:none;">リンクを開く 🔗</a>` : '';
}
function openInfo(){ if(!nearFrame) return; fillInfo(nearFrame.data); info.style.opacity='1'; info.style.transform='translate(-50%,0)'; info.style.pointerEvents='auto'; document.getElementById('peek').style.display='none'; }
function closeInfo(){ info.style.opacity='0'; info.style.transform='translate(-50%,16px)'; info.style.pointerEvents='none'; if(nearFrame) document.getElementById('peek').style.display='inline-block'; }
```
`animate()` の `renderer.render` 直前に近接判定を追加:
```js
  let nf=null,nd=5.5;
  frames.forEach(f=>{ const dd=camera.position.distanceTo(f.pos); if(dd<nd){nd=dd;nf=f;} });
  if((nf&&nf.data.id)!==(nearFrame&&nearFrame.data.id)){
    nearFrame=nf; closeInfo(); document.getElementById('peek').style.display= nf?'inline-block':'none';
  }
```

- [ ] **Step 2: headless 検証（描画）＋実ブラウザで近接確認**

Run:
```bash
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; cd penguin-gallery
"$CH" --headless=new --disable-gpu --window-size=1000,700 --screenshot="/tmp/pg_t5.png" "file://$PWD/index.html?mock=1" 2>/dev/null; ls -la /tmp/pg_t5.png
```
Expected: エラーなく描画（近接キャプションは実ブラウザで額に近づいて手動確認）。

- [ ] **Step 3: コミット**

```bash
git add penguin-gallery/index.html
git commit -m "penguin-gallery: proximity caption (product/author/highlight/link)"
```

---

### Task 6: 提出フロー（PDF/画像→画像化→長辺2000pxリサイズ→Storage→RTDB）

**Files:**
- Modify: `penguin-gallery/index.html`

**Interfaces:**
- Consumes: `db`, `storage`, `fbReady`。
- Produces: `#submit` フォームUI／`fileToCanvas(file)`→Promise<canvas>（PDFはPDF.jsで1ページ目、画像はImageから描画）／`resizeCanvas(canvas,max=2000)`→canvas／`uploadExhibit({file,productName,author,link,highlight})`→Promise。`penguin/config/submissionsOpen` を購読して受付ON/OFFを反映。

- [ ] **Step 1: PDF.js を head に追加**

`</head>` 直前に:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs" type="module"></script>
<script type="module">
  import * as pdfjsLib from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs';
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
  window.pdfjsLib=pdfjsLib;
</script>
```

- [ ] **Step 2: 提出UIと関数を追加**

`<body>` に追加:
```html
<button id="openSubmit" onclick="showSubmit()" style="position:fixed;left:16px;top:16px;z-index:12;background:rgba(127,214,255,.2);border:1px solid rgba(127,214,255,.5);color:#dff2ff;padding:10px 16px;border-radius:999px;cursor:pointer;font-family:inherit;">＋ ポスターを出す</button>
<div id="submit" style="position:fixed;inset:0;z-index:30;display:none;align-items:center;justify-content:center;background:rgba(4,16,28,.7);padding:16px;">
  <div style="width:min(94%,460px);background:#0c2438;border:1px solid rgba(160,220,255,.3);border-radius:18px;padding:18px;">
    <div style="font-size:17px;font-weight:800;margin-bottom:4px;">ポスターを展示する</div>
    <div id="sub-note" style="font-size:12px;color:#9fd0ee;margin-bottom:10px;">PDF または 画像（PNG/JPG）・15MBまで</div>
    <input id="f-file" type="file" accept="application/pdf,image/png,image/jpeg" style="width:100%;color:#dff2ff;margin-bottom:8px;">
    <input id="f-product" maxlength="40" placeholder="プロダクト名" style="width:100%;padding:9px;margin-bottom:8px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;">
    <input id="f-author" maxlength="30" placeholder="名前" style="width:100%;padding:9px;margin-bottom:8px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;">
    <input id="f-link" maxlength="200" placeholder="リンク（https://… 任意）" style="width:100%;padding:9px;margin-bottom:8px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;">
    <input id="f-highlight" maxlength="60" placeholder="見てほしいポイント（任意）" style="width:100%;padding:9px;margin-bottom:10px;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;">
    <button id="f-go" onclick="doSubmit()" style="width:100%;padding:11px;border:none;border-radius:999px;background:linear-gradient(120deg,#7fd6ff,#4b9fe0);color:#06283d;font-weight:800;cursor:pointer;">展示する</button>
    <button onclick="document.getElementById('submit').style.display='none'" style="width:100%;padding:9px;margin-top:8px;background:none;border:1px solid rgba(255,255,255,.25);border-radius:999px;color:#cfe6f7;cursor:pointer;">閉じる</button>
  </div>
</div>
```
`<script>` に追加:
```js
let submissionsOpen=true;
if(fbReady) db.ref('penguin/config/submissionsOpen').on('value',s=>{ submissionsOpen = s.val()!==false; });
function showSubmit(){
  const n=document.getElementById('sub-note'), go=document.getElementById('f-go');
  if(!submissionsOpen){ n.textContent='受付は終了しました（鑑賞はできます）'; go.disabled=true; go.style.opacity=.5; }
  document.getElementById('submit').style.display='flex';
}
function resizeCanvas(cv,max=2000){
  const w=cv.width,h=cv.height,s=Math.min(1,max/Math.max(w,h)); if(s>=1) return cv;
  const o=document.createElement('canvas'); o.width=Math.round(w*s); o.height=Math.round(h*s);
  o.getContext('2d').drawImage(cv,0,0,o.width,o.height); return o;
}
async function fileToCanvas(file){
  if(file.type==='application/pdf'){
    const buf=await file.arrayBuffer();
    const pdf=await window.pdfjsLib.getDocument({data:buf}).promise;
    const page=await pdf.getPage(1);
    const vp=page.getViewport({scale:2});
    const cv=document.createElement('canvas'); cv.width=vp.width; cv.height=vp.height;
    await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
    return cv;
  } else {
    const img=await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=URL.createObjectURL(file); });
    const cv=document.createElement('canvas'); cv.width=img.naturalWidth; cv.height=img.naturalHeight;
    cv.getContext('2d').drawImage(img,0,0); return cv;
  }
}
async function doSubmit(){
  const file=document.getElementById('f-file').files[0];
  const productName=document.getElementById('f-product').value.trim();
  const author=document.getElementById('f-author').value.trim();
  const link=document.getElementById('f-link').value.trim();
  const highlight=document.getElementById('f-highlight').value.trim();
  if(!submissionsOpen){ alert('受付は終了しました'); return; }
  if(!file){ alert('ファイルを選んでください'); return; }
  if(file.size>15*1024*1024){ alert('15MBまでにしてください'); return; }
  if(!/^(application\/pdf|image\/png|image\/jpeg)$/.test(file.type)){ alert('PDF/PNG/JPGのみ'); return; }
  if(!productName||!author){ alert('プロダクト名と名前は必須です'); return; }
  const go=document.getElementById('f-go'); go.disabled=true; go.textContent='展示中…';
  try{
    const canvas=resizeCanvas(await fileToCanvas(file),2000);
    const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',0.9));
    const key=db.ref('penguin/exhibits').push().key;
    const ref=storage.ref('penguin/'+key+'.jpg');
    await ref.put(blob);
    const imageUrl=await ref.getDownloadURL();
    await db.ref('penguin/exhibits/'+key).set({ productName, author, link, highlight, imageUrl, ts:Date.now() });
    document.getElementById('submit').style.display='none';
    document.getElementById('f-file').value=''; document.getElementById('f-product').value=''; document.getElementById('f-author').value=''; document.getElementById('f-link').value=''; document.getElementById('f-highlight').value='';
  }catch(e){ console.error(e); alert('展示に失敗しました：'+(e.message||e)); }
  finally{ go.disabled=false; go.textContent='展示する'; }
}
```

- [ ] **Step 3: 実ブラウザで提出を1件テスト（要 Task9 のルール開放後）**

Run（描画にエラーが無いか）:
```bash
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; cd penguin-gallery
"$CH" --headless=new --disable-gpu --window-size=1000,700 --screenshot="/tmp/pg_t6.png" "file://$PWD/index.html" 2>/dev/null; ls -la /tmp/pg_t6.png
```
Expected: エラーなく初期表示。提出の実地テストは Task9 でルール開放後、実ブラウザでPDF/画像を1件出し、額が増えることを確認。

- [ ] **Step 4: コミット**

```bash
git add penguin-gallery/index.html
git commit -m "penguin-gallery: submit form (PDF/image -> canvas -> resize -> Storage -> RTDB)"
```

---

### Task 7: 演出（オーロラ・雪・ペンギンInstancedMesh・軽量モード）

**Files:**
- Modify: `penguin-gallery/index.html`

**Interfaces:**
- Consumes: `scene`, `animate`。
- Produces: `buildAurora() buildSnow() buildPenguins(count)`／`updateDecor(t)`（animate内で毎フレーム）／`#lite`トグルで `LITE` フラグ→装飾数を削減。ペンギンは `InstancedMesh`（円錐胴＋球頭を1メッシュに）で `count` 体、各体は静止＋時々向き変え。

- [ ] **Step 1: 装飾を追加**

`<script>` に追加:
```js
let LITE=false, aurora=null, snow=null, penguins=null, penDummy=new THREE.Object3D();
function buildAurora(){
  const g=new THREE.PlaneGeometry(240,60,1,1);
  const m=new THREE.MeshBasicMaterial({color:0x66ffcc,transparent:true,opacity:0.14,side:THREE.DoubleSide,depthWrite:false});
  aurora=new THREE.Mesh(g,m); aurora.position.set(0,40,-60); scene.add(aurora);
  const m2=m.clone(); m2.color=new THREE.Color(0x7f88ff); m2.opacity=0.1;
  const a2=new THREE.Mesh(g,m2); a2.position.set(0,48,-70); scene.add(a2); aurora.userData.a2=a2;
}
function buildSnow(){
  const N=LITE?400:1400; const pos=new Float32Array(N*3);
  for(let i=0;i<N;i++){ pos[i*3]=(Math.random()-0.5)*120; pos[i*3+1]=Math.random()*40; pos[i*3+2]=(Math.random()-0.5)*120; }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  snow=new THREE.Points(g,new THREE.PointsMaterial({color:0xffffff,size:0.18,transparent:true,opacity:0.85})); scene.add(snow);
}
function buildPenguins(count){
  const body=new THREE.CylinderGeometry(0.28,0.36,0.9,8);
  penguins=new THREE.InstancedMesh(body,new THREE.MeshStandardMaterial({color:0x20303f,roughness:0.7}),count);
  const R=radiusFor(frames.length)-2;
  for(let i=0;i<count;i++){
    const ang=Math.random()*Math.PI*2, r=Math.min(R, 4+Math.random()*(R-4));
    penDummy.position.set(Math.sin(ang)*r,0.45,Math.cos(ang)*r); penDummy.rotation.y=Math.random()*Math.PI*2; penDummy.updateMatrix();
    penguins.setMatrixAt(i,penDummy.matrix);
  }
  penguins.instanceMatrix.needsUpdate=true; scene.add(penguins);
}
function updateDecor(t){
  if(aurora){ aurora.material.opacity=0.12+0.05*Math.sin(t*0.5); aurora.userData.a2.material.opacity=0.08+0.04*Math.sin(t*0.4+1); }
  if(snow){ const p=snow.geometry.attributes.position; for(let i=0;i<p.count;i++){ let y=p.getY(i)-0.03; if(y<0)y=40; p.setY(i,y);} p.needsUpdate=true; }
}
function buildDecor(){ buildAurora(); buildSnow(); buildPenguins(LITE?18:48); }
buildDecor();
```
軽量モードトグル `<body>`:
```html
<button id="lite" onclick="toggleLite()" style="position:fixed;right:16px;top:16px;z-index:12;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.3);color:#dff2ff;padding:8px 12px;border-radius:999px;cursor:pointer;font-family:inherit;font-size:12px;">軽量モード</button>
```
```js
function toggleLite(){ LITE=!LITE;
  if(aurora){scene.remove(aurora);scene.remove(aurora.userData.a2);aurora=null;}
  if(snow){scene.remove(snow);snow=null;} if(penguins){scene.remove(penguins);penguins=null;}
  if(!LITE) buildDecor(); else { buildSnow(); buildPenguins(18); }
  document.getElementById('lite').textContent=LITE?'標準モード':'軽量モード';
}
```
`animate()` の先頭付近（`const sp=` の前）に:
```js
  updateDecor(performance.now()*0.001);
```

- [ ] **Step 2: headless 検証**

Run:
```bash
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; cd penguin-gallery
"$CH" --headless=new --disable-gpu --window-size=1000,700 --screenshot="/tmp/pg_t7.png" "file://$PWD/index.html?mock=1" 2>/dev/null; ls -la /tmp/pg_t7.png
```
Expected: 空にオーロラ、雪、円内にペンギン（濃色の小柱）が多数（目視）。

- [ ] **Step 3: コミット**

```bash
git add penguin-gallery/index.html
git commit -m "penguin-gallery: aurora + snow + instanced penguins + lite mode"
```

---

### Task 8: 苺を投げる

**Files:**
- Modify: `penguin-gallery/index.html`

**Interfaces:**
- Consumes: `scene`, `camera`, `animate`, `_fwd`。
- Produces: `#berry`ボタン／`throwBerry()`（視線方向へ初速）／`berries[]`＋`updateBerries(dt)`（重力・着地・軽い弾み・寿命）。低ポリ球(赤)。

- [ ] **Step 1: 苺ロジックを追加**

`<body>`:
```html
<button id="berry" onclick="throwBerry()" style="position:fixed;left:50%;bottom:30px;transform:translateX(-50%);z-index:9;background:rgba(255,90,120,.25);border:1px solid rgba(255,140,160,.6);color:#ffd8e0;padding:10px 18px;border-radius:999px;cursor:pointer;font-family:inherit;">🍓 いちごを投げる</button>
```
`<script>`:
```js
const berries=[]; const berryGeo=new THREE.SphereGeometry(0.16,10,8); const berryMat=new THREE.MeshStandardMaterial({color:0xff375f,roughness:0.5});
function throwBerry(){
  const m=new THREE.Mesh(berryGeo,berryMat);
  m.position.copy(camera.position);
  const dir=_fwd.clone().normalize();
  const v=dir.multiplyScalar(9); v.y=4.5;
  berries.push({m,v,life:6}); scene.add(m);
  if(berries.length>120){ const old=berries.shift(); scene.remove(old.m); }
}
let _lt=performance.now();
function updateBerries(){
  const now=performance.now(), dt=Math.min(0.05,(now-_lt)/1000); _lt=now;
  for(let i=berries.length-1;i>=0;i--){ const b=berries[i];
    b.v.y-=14*dt; b.m.position.addScaledVector(b.v,dt);
    if(b.m.position.y<0.16){ b.m.position.y=0.16; b.v.y=-b.v.y*0.4; b.v.x*=0.7; b.v.z*=0.7; }
    b.life-=dt; if(b.life<=0){ scene.remove(b.m); berries.splice(i,1); }
  }
}
```
`animate()` の `updateDecor(...)` の次行に:
```js
  updateBerries();
```

- [ ] **Step 2: headless 検証（苺を数個投げてスクショ）**

Run:
```bash
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; cd penguin-gallery
"$CH" --headless=new --disable-gpu --window-size=1000,700 --screenshot="/tmp/pg_t8.png" "file://$PWD/index.html?mock=1" 2>/dev/null; ls -la /tmp/pg_t8.png
```
Expected: エラーなく描画（放物線・弾みは実ブラウザでボタン連打して手動確認）。

- [ ] **Step 3: コミット**

```bash
git add penguin-gallery/index.html
git commit -m "penguin-gallery: throw strawberries (parabolic + bounce)"
```

---

### Task 9: 管理（合言葉ゲート・受付ON/OFF・削除）＋Firebaseルール開放

**Files:**
- Modify: `penguin-gallery/index.html`

**Interfaces:**
- Consumes: `db`, `storage`, `frames`。
- Produces: `#admin`モーダル（`?admin=1`で開く）／`ADMIN_CODE`（クライアント側の合言葉・誤操作防止）／`toggleSubmissions(bool)`（`penguin/config/submissionsOpen`）／`deleteExhibit(id)`（`penguin/exhibits/<id>` 削除＋`penguin/<id>.jpg` Storage削除）。

- [ ] **Step 1: 管理UIを追加**

`<body>`:
```html
<div id="admin" style="position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;background:rgba(4,16,28,.8);padding:16px;">
  <div style="width:min(94%,480px);max-height:80vh;overflow:auto;background:#0c2438;border:1px solid rgba(160,220,255,.3);border-radius:18px;padding:18px;">
    <div style="font-size:17px;font-weight:800;">管理</div>
    <div id="admin-gate">
      <input id="a-code" type="password" placeholder="合言葉" style="width:100%;padding:9px;margin:10px 0;border-radius:8px;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.08);color:#fff;">
      <button onclick="adminUnlock()" style="width:100%;padding:10px;border:none;border-radius:999px;background:#7fd6ff;color:#06283d;font-weight:800;cursor:pointer;">開く</button>
    </div>
    <div id="admin-body" style="display:none;">
      <label style="display:flex;align-items:center;gap:8px;margin:12px 0;"><input id="a-open" type="checkbox" onchange="toggleSubmissions(this.checked)"> 提出を受け付ける</label>
      <div id="a-list"></div>
    </div>
    <button onclick="document.getElementById('admin').style.display='none'" style="width:100%;padding:9px;margin-top:10px;background:none;border:1px solid rgba(255,255,255,.25);border-radius:999px;color:#cfe6f7;cursor:pointer;">閉じる</button>
  </div>
</div>
```
`<script>`:
```js
const ADMIN_CODE='penguin2026'; // 誤操作防止レベル（本物の認証ではない）
if(new URLSearchParams(location.search).get('admin')) document.getElementById('admin').style.display='flex';
function adminUnlock(){
  if(document.getElementById('a-code').value!==ADMIN_CODE){ alert('合言葉が違います'); return; }
  document.getElementById('admin-gate').style.display='none';
  document.getElementById('admin-body').style.display='block';
  db.ref('penguin/config/submissionsOpen').once('value').then(s=>{ document.getElementById('a-open').checked = s.val()!==false; });
  renderAdminList();
}
function toggleSubmissions(v){ db.ref('penguin/config/submissionsOpen').set(!!v); }
function renderAdminList(){
  db.ref('penguin/exhibits').once('value').then(snap=>{
    const val=snap.val()||{}; const el=document.getElementById('a-list');
    el.innerHTML=Object.entries(val).map(([id,d])=>`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:1px solid rgba(255,255,255,.1);padding:8px 0;"><span style="font-size:13px;">${esc(d.productName||'無題')} <span style="color:#9fd0ee;">/ ${esc(d.author||'')}</span></span><button onclick="deleteExhibit('${id}')" style="background:rgba(255,120,120,.2);border:1px solid rgba(255,150,150,.5);color:#ffd0d0;border-radius:8px;padding:4px 10px;cursor:pointer;">削除</button></div>`).join('')||'<div style="color:#9fd0ee;padding:8px 0;">まだ展示がありません</div>';
  });
}
async function deleteExhibit(id){
  if(!confirm('この展示を削除しますか？')) return;
  try{ await db.ref('penguin/exhibits/'+id).remove(); await storage.ref('penguin/'+id+'.jpg').delete().catch(()=>{}); renderAdminList(); }
  catch(e){ alert('削除に失敗：'+(e.message||e)); }
}
```

- [ ] **Step 2: Firebase ルールを開放（`penguin/` のみ）**

`docs/superpowers/plans/2026-07-11-penguin-gallery.md` の下記JSONを Firebase コンソール(Realtime Database→ルール)に追加する（既存ルールを消さず `penguin` を足す）。**授業後にこの `penguin` ブロックを削除して閉じる。**
```json
{
  "rules": {
    "art": { ".write": false, "artworks": { ".read": true }, "avatars": { ".read": true }, "critique": { ".read": true }, "next_class": { ".read": true }, "next_class_students": { ".read": true }, "certificates": { "$id": { ".read": true } } },
    "dessin": { ".read": true, ".write": false },
    "bijutsu": { "$key": { ".read": true, ".write": true } },
    "penguin": { ".read": true, ".write": true }
  }
}
```
Storage ルール(Storage→Rules)にも `penguin/` を追加:
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /penguin/{file} { allow read: if true; allow write: if request.resource.size < 15 * 1024 * 1024; }
  }
}
```

- [ ] **Step 3: 実ブラウザで一連確認**

実ブラウザで `index.html` を開き:
- `＋ ポスターを出す` からPDFと画像を1件ずつ提出 → 円に額が追加され画像が表示
- `index.html?admin=1` → 合言葉 `penguin2026` → 受付OFFにすると提出がブロックされる／削除で額が消える

- [ ] **Step 4: コミット**

```bash
git add penguin-gallery/index.html
git commit -m "penguin-gallery: admin (passphrase, submissions toggle, delete) + open penguin/ rules"
```

---

### Task 10: Vercel 新規プロジェクトへデプロイ＋公開確認

**Files:**
- Create: `penguin-gallery/vercel.json`

**Interfaces:**
- Produces: 公開URL（`penguin-gallery-*.vercel.app`）。

- [ ] **Step 1: vercel.json を作成（静的配信・キャッシュ最小）**

```json
{ "cleanUrls": true }
```

- [ ] **Step 2: デプロイ**

```bash
cd penguin-gallery && vercel --prod --yes --scope flotancs-projects 2>&1 | grep -iE "ready\.|BUILD_ERROR" | tail -1
```
Expected: `... ready.`

- [ ] **Step 3: 公開URLで確認＋コミット**

公開URLをブラウザで開き、提出→展示→鑑賞→管理が動くことを確認。
```bash
cd .. && git add penguin-gallery/vercel.json && git commit -m "penguin-gallery: vercel config + deploy"
```

---

## Self-Review

**1. Spec coverage**
- 氷の円形回廊＝Task2 / 自動半径＝Task2(`radiusFor`) / 中央氷山＝Task1 ✓
- 提出(PDF/画像→画像化→リサイズ→Storage→RTDB)＝Task6 ✓ / 15MB＋長辺2000px＝Task6(`resizeCanvas`,size check) ✓
- 近接キャプション(product/author/highlight/link, httpsのみ)＝Task5 ✓
- オーロラ・雪・ペンギンInstancedMesh・軽量モード＝Task7 ✓ / 苺投げ＝Task8 ✓
- 受付ON/OFF・削除・合言葉＝Task9 ✓ / penguin/隔離＝全タスクでパス固定＋ルールもpenguinのみ ✓
- 同時接続(プレゼンス非搭載でDB購読のみ)＝設計どおり実装（Task3の`.on('value')`）✓
- 授業後に閉じる＝Task9のルール削除＋受付OFF（運用手順として記載）✓

**2. Placeholder scan:** TBD/TODO無し。各コードステップは実コードを含む。✓

**3. Type consistency:** exhibit shape `{productName,author,link,highlight,imageUrl,ts}` はTask3/5/6/9で一致。`frames[]`要素 `{mesh,data,pos,picMesh,ang}` はTask2で定義しTask3/4/5/7で同名参照。`radiusFor` はTask2定義→Task4/7参照。`_fwd` はTask4定義→Task8参照。✓

**注意点（実装者向け）:** headless Chromeは requestAnimationFrame が継続しないことがあるため、苺の放物線・近接キャプション・操作は**実ブラウザで手動確認**する（rowke開発時と同じ制約）。headlessスクショは「エラーなく初期描画されるか」の確認に用いる。
