import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';

// Visualizador 3D SOL E MANGA — conceito baseado no anteprojeto de 19 pranchas.
// A geometria carregada é um GLB real: 194 malhas (chassi, rodas, armários, produtos, etc.).
// A base64 do GLB é injetada no index.html pelo build; por isso um único HTML abre o modelo.
const byId = id => document.getElementById(id);
const viewport = byId('viewport');
const canvas = byId('webgl');
const loading = byId('loading');
let renderer, scene, camera, orbit, root, clock, ground, grid;
let parsedModel = null;
let glbBuffer = null;
const nodes = [];
const pivots = {doors:[],drawer:null,front:null};
const state = {mode:'complete', night:false, led:true, panels:true, equipment:true, poly:true, open:false,drawer:false, rotate:false, labels:false};
const motion = [];
const bound = {min:new THREE.Vector3(-2.07,.06,-.99),max:new THREE.Vector3(.84,2.51,.99)};
const technical = new THREE.Group();
let ambient, hemi, sun, ledLights=[];
const camPositions={
 iso:[3.45,2.70,3.75], operator:[0.25,1.5,5.0], front:[-5.00,1.40,0.01], back:[5.00,1.40,0.01],
 side:[0.01,1.50,5.00], client:[0.25,1.7,-5.00],
 top:[.09,5.5,.01], interior:[1.60,1.95,3.3]
};
const targetPoint = new THREE.Vector3(-.25,1.24,0);
const mats = {gold:0xffd05b, dark:0x073a26};
const DEFAULT_NOTES='Modelo de estudo baseado nas 19 pranchas do anteprojeto. Não substitui conferência executiva.';
function setStatus(s){byId('status').textContent=s;}
function init(){
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.18;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  scene=new THREE.Scene();
  scene.background=new THREE.Color(0xe9f3e6);
  scene.fog=new THREE.FogExp2(0xe9f3e6,.022);
  camera=new THREE.PerspectiveCamera(39,1,.02,125);
  camera.position.set(...camPositions.iso);
  orbit=new OrbitControls(camera,canvas);
  orbit.enableDamping=true;orbit.dampingFactor=.075;
  orbit.target.copy(targetPoint); orbit.minDistance=.75;orbit.maxDistance=16;
  orbit.maxPolarAngle=Math.PI*.94;
  orbit.screenSpacePanning=true;
  orbit.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};
  hemi=new THREE.HemisphereLight(0xffffff,0x8b9f88,2.0);scene.add(hemi);
  ambient=new THREE.AmbientLight(0xffffff,.60);scene.add(ambient);
  sun=new THREE.DirectionalLight(0xffffff,3.15);sun.position.set(-3.8,8.2,5);
  sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-6;sun.shadow.camera.right=6;sun.shadow.camera.top=6;sun.shadow.camera.bottom=-6;sun.shadow.camera.near=.25;sun.shadow.camera.far=22;sun.shadow.bias=-.0004;scene.add(sun);
  const floorMat=new THREE.MeshStandardMaterial({color:0xdce9dc,roughness:.89,metalness:0});
  ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),floorMat);ground.rotation.x=-Math.PI/2;ground.position.y=.045;ground.receiveShadow=true;scene.add(ground);
  grid=new THREE.GridHelper(13,26,0xa8c5b0,0xcfe0d0);grid.position.y=.053;grid.material.opacity=.28;grid.material.transparent=true;scene.add(grid);
  for(const [x,z] of [[-.75,-.55],[.75,-.55],[-.75,.55],[.75,.55]]){
    const p=new THREE.PointLight(0xffc34d,0,3.3,2);p.position.set(x,1.95,z);scene.add(p);ledLights.push(p);
  }
  scene.add(technical); makeDimensions();
  canvas.addEventListener('pointerup',pickNode);
  window.addEventListener('resize',resize);
  document.addEventListener('keydown',e=>{
    if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
    if(e.key==='r'||e.key==='R')resetCamera();
    if(['1','2','3','4','5'].includes(e.key))activateMode(['complete','structure','interior','technical','night'][Number(e.key)-1]);
  });
  resize();clock=new THREE.Clock();requestAnimationFrame(animate);
  loadEmbedded();
}
function resize(){
  const w=Math.max(1,viewport.clientWidth),h=Math.max(1,viewport.clientHeight);
  if(!camera||!renderer)return;
  camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);
}
async function loadEmbedded(){
  try{
    const text=byId('embedded-glb')?.textContent?.trim();
    if(!text)throw new Error('GLB incorporado ausente');
    const raw=atob(text);
    const bytes=new Uint8Array(raw.length);
    for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    glbBuffer=bytes.buffer;
    const loader=new GLTFLoader();
    loader.parse(glbBuffer.slice(0),'',gltf=>{
      root=gltf.scene;root.name='SOL_E_MANGA_ANTEPROJETO';
      scene.add(root);parsedModel=root;
      root.traverse(obj=>{
        if(obj.isMesh){
          nodes.push(obj);obj.castShadow=!obj.name.includes('Policarbonato');
          obj.receiveShadow=true;
          // Materials from GLB retain the real geometry and color data.
          // Customize PBR roughness by component (ACM, stainless steel, rubber, wood).
          if(!/Arte cliente|Logotipo testeira/.test(obj.name) && obj.material?.isMeshStandardMaterial){
            obj.material=obj.material.clone();
            const n=obj.name;
            if(/Pneu|Rodizio cambao/.test(n)){obj.material.metalness=.0;obj.material.roughness=.94}
            else if(/Chassi|Cambao|Engate|Coluna|Anel|Travessa|Sapatas|sapata|Sapata/.test(n)){obj.material.metalness=.72;obj.material.roughness=.42}
            else if(/Bancada inox|Pia cuba|Pia tanque|Calota|Torneira/.test(n)){obj.material.metalness=.82;obj.material.roughness=.33}
            else if(/madeira|Madeira|Bandeja temperos|Expositor de copos|Piso compensado|Gaveta caixa/.test(n)){obj.material.metalness=.03;obj.material.roughness=.78}
            else if(/ACM|Testeira|testeira|P0[6789]|P1[023]/.test(n)){obj.material.metalness=.14;obj.material.roughness=.30}
            else if(/Manga|Bisnaga|Cesto|Copo/.test(n)){obj.material.metalness=.0;obj.material.roughness=.69}
            else {obj.material.metalness=.14;obj.material.roughness=.55}
          }
          if(obj.name.includes('Policarbonato')){
            obj.material=new THREE.MeshPhysicalMaterial({color:0xdbf8f3,metalness:0,roughness:.08,transmission:.68,transparent:true,opacity:.24,side:THREE.DoubleSide,depthWrite:false});
          }
          if(obj.name.includes('LED')){
            obj.material=new THREE.MeshStandardMaterial({color:0xffca55,emissive:0xffbb35,emissiveIntensity:2.8,metalness:0,roughness:.2});
          }
        }
      });
      createInteractiveParts();
      setupEvents();
      applyMode();
      loading.classList.add('done');
      byId('geometryCount').textContent=`${nodes.length} malhas 3D`;
      setStatus('Modelo GLB carregado • arraste para girar');
    },err=>{throw err});
  }catch(e){loading.innerHTML=`<div style="padding:22px;color:#8b271d"><b>Falha ao carregar o visualizador.</b><p>${escapeHTML(e.message)}</p></div>`;console.error(e)}
}
function escapeHTML(str){return String(str).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
// GLB geometry is already in world coordinates. For cabinet hinges, re-parent and offset meshes.
function byPrefix(prefix){return nodes.filter(o=>o.name.startsWith(prefix));}
function wrapMatching(prefix,pivot,name){
  const found=byPrefix(prefix);
  if(!found.length)return null;
  const p=new THREE.Vector3(...pivot);
  const parent=found[0].parent;
  const group=new THREE.Group();group.name=name;group.position.copy(p);parent.add(group);
  for(const mesh of found){mesh.position.sub(p);group.add(mesh)}
  return group;
}
function createInteractiveParts(){
  const defs=[
    ['P12 Porta caixa termica',[-.795,.0,.611],'Porta caixa térmica'],
    ['P10 Porta caixa e reserva',[-.160,0,.611],'Porta gaveta e copos'],
    ['P13 Porta cuba',[.390,0,.611],'Porta cuba e cofre']
  ];
  for(const [prefix,p,name] of defs){
    const g=wrapMatching(prefix,p,name);if(g)pivots.doors.push(g);
  }
  pivots.front=wrapMatching('P09 ACM Porta mangas frontal',[-.803,0,-.53],'Porta frontal mangas');
  const drawerMesh=byPrefix('Gaveta caixa forte MDF')[0];
  if(drawerMesh){pivots.drawer=new THREE.Group();pivots.drawer.name='Gaveta dinheiro telescopica';root.add(pivots.drawer);pivots.drawer.add(drawerMesh);}
  const frontSlot=byPrefix('Gaveta fenda frente')[0];if(pivots.drawer&&frontSlot)pivots.drawer.add(frontSlot);
}
function tween(target,property,to,speed=5){
  for(let i=motion.length-1;i>=0;i--)if(motion[i].target===target&&motion[i].property===property)motion.splice(i,1);
  motion.push({target,property,to,speed});
}
function openAllDoors(open){
  state.open=open;
  pivots.doors.forEach((g,i)=>tween(g.rotation,'y',(i===2?-1:1)* (open?1.12:0),4));
  if(pivots.front)tween(pivots.front.rotation,'y',open?-.90:0,4);
  byId('openDoors').textContent=open?'Fechar portas':'Abrir portas';
}
function slideDrawer(open){
  state.drawer=open;
  if(pivots.drawer)tween(pivots.drawer.position,'z',open?.34:0,3.5);
  byId('openDrawer').textContent=open?'Fechar gaveta':'Abrir gaveta';
}
function isPanel(n){return /^P\d\d\b/.test(n)||n.startsWith('P07 Arte')||n.includes('Logotipo testeira');}
function isShell(n){return isPanel(n)||n.includes('Policarbonato')||n.includes('Para-lama');}
function isEquipment(n){
  return /Maquina|Manga verde|Cesto mangas|Bandeja temperos|Bisnaga|Copo expositor|Expositor de copos|Caixa termica|Tampa caixa termica|Bateria estacionaria|Quadro eletrico|Bomba eletrica|Agua limpa|Agua servida|Tanque |Bocal do tanque|Tubulacao|Cofre e reserva|Torneira|Pia cuba|Pia tanque|Gaveta caixa|Gaveta fenda/.test(n);
}
function isStructure(n){return /^(M2 |M3 )/.test(n) || n.includes('LED') || n.includes('Pneu') || n.includes('Calota') || n.includes('cubo') || n.includes('Sapatas');}
function applyMode(){
  const mode=state.mode;
  if(!root)return;
  nodes.forEach(n=>{
    const s=n.name;
    let visible=true;
    if(mode==='structure')visible=isStructure(s);
    else if(mode==='interior')visible=!isPanel(s)&&!s.includes('Policarbonato');
    else visible=(state.panels||!isPanel(s))&&(state.poly||!s.includes('Policarbonato'));
    if(!state.equipment&&isEquipment(s))visible=false;
    if(!state.led&&s.includes('LED'))visible=false;
    n.visible=visible;
  });
  technical.visible=mode==='technical'||state.labels;
  const isNight=state.night||mode==='night';
  scene.background=new THREE.Color(isNight?0x071c21:0xe9f3e6);
  scene.fog.color.set(isNight?0x071c21:0xe9f3e6);
  hemi.intensity=isNight?.38:2.0;ambient.intensity=isNight?.22:.60;
  sun.intensity=isNight?.22:3.15;
  ground.material.color.set(isNight?0x182f2e:0xdce9dc);
  grid.visible=!isNight;
  ledLights.forEach(l=>l.intensity=state.led?(isNight?3.7:.35):0);
  nodes.filter(n=>n.name.includes('LED')).forEach(n=>{if(n.material?.emissive)n.material.emissiveIntensity=state.led?(isNight?5.5:1.9):0});
  renderer.toneMappingExposure=isNight?1.35:1.18;
  byId('modeDesc').textContent=({complete:'Identidade visual e todos os componentes.',structure:'Chassi, metalon, rodas, engate e sapatas.',interior:'Acesso aos armários, hidráulica e bateria.',technical:'Dimensões gerais destacadas em metros.',night:'Iluminação LED e ambiente noturno.'})[mode];
  document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));
  byId('togglePanels').checked=state.panels;
  byId('toggleEquipment').checked=state.equipment;
  byId('togglePoly').checked=state.poly;
  byId('toggleLed').checked=state.led;
  byId('toggleNight').checked=state.night||mode==='night';
}
function activateMode(mode){
  state.mode=mode;
  if(mode==='night'){state.night=true;state.led=true}
  else state.night=false;
  applyMode();
  if(mode==='interior'){setCamera('interior');openAllDoors(true);slideDrawer(true)}
  else if(mode==='technical')setCamera('iso');
  else if(mode==='structure')setCamera('side');
  else if(mode==='complete')setCamera('iso');
  else setCamera('iso');
  setStatus(`Modo: ${({complete:'completo',structure:'estrutura',interior:'interno',technical:'técnico',night:'noturno'})[mode]}`);
}
function setCamera(view){
  const xyz=camPositions[view]||camPositions.iso;
  camera.position.set(...xyz);
  if(view==='top')camera.up.set(0,0,-1);else camera.up.set(0,1,0);
  orbit.target.copy(targetPoint);orbit.update();
  byId('viewSelect').value=view;
}
function resetCamera(){setCamera('iso');openAllDoors(false);slideDrawer(false);}
function makeDimensions(){
 const yellow=new THREE.LineBasicMaterial({color:0xe4a32b,depthTest:false,transparent:true,opacity:.95});
 const mark=(a,b)=>{
   const geo=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a),new THREE.Vector3(...b)]);
   const l=new THREE.Line(geo,yellow);l.renderOrder=50;technical.add(l);
 };
 const label=(message,xyz,scale=1)=>{
   const c=document.createElement('canvas');c.width=512;c.height=124;
   const ctx=c.getContext('2d');ctx.fillStyle='#103f2e';ctx.roundRect(0,0,512,124,20);ctx.fill();
   ctx.fillStyle='#fff8e6';ctx.font='bold 55px system-ui, Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(message,256,62);
   const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
   const s=new THREE.Sprite(new THREE.SpriteMaterial({map:t,transparent:true,depthTest:false}));
   s.scale.set(.72*scale,.175*scale,1);s.position.set(...xyz);s.renderOrder=51;technical.add(s);
 };
 const x1=-.8,x2=.8,z=.88;
 mark([x1,.23,z],[x2,.23,z]);
 for(let x of [x1,x2])mark([x,.16,z-.07],[x,.30,z+.07]);
 label('1,60 m',[0,.25,z+.01]);
 const x=.99,y=1.12;
 mark([x,y,-.6],[x,y,.6]);
 for(let z of [-.6,.6])mark([x-.08,y,z],[x+.08,y,z]);
 label('1,20 m',[1.18,y,0],.78);
 mark([1.0,0,.78],[1.0,2.50,.78]);
 for(let h of [0,.4,1.10,2.05,2.50])mark([.95,h,.71],[1.08,h,.84]);
 label('2,50 m',[1.09,2.25,.78],.80);
 label('0,70 m',[1.10,.76,.78],.61);
 label('0,95 m',[1.10,1.58,.78],.61);
 label('0,45 m',[1.10,2.30,.78],.61);
 technical.visible=false;
}
function setupEvents(){
 document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>activateMode(b.dataset.mode)));
 byId('viewSelect').addEventListener('change',e=>setCamera(e.target.value));
 byId('resetCamera').addEventListener('click',resetCamera);
 byId('openDoors').addEventListener('click',()=>openAllDoors(!state.open));
 byId('openDrawer').addEventListener('click',()=>slideDrawer(!state.drawer));
 byId('togglePanels').addEventListener('change',e=>{state.panels=e.target.checked;applyMode()});
 byId('toggleEquipment').addEventListener('change',e=>{state.equipment=e.target.checked;applyMode()});
 byId('togglePoly').addEventListener('change',e=>{state.poly=e.target.checked;applyMode()});
 byId('toggleLed').addEventListener('change',e=>{state.led=e.target.checked;applyMode()});
 byId('toggleNight').addEventListener('change',e=>{state.night=e.target.checked;if(state.mode==='night'&&!state.night)state.mode='complete';applyMode()});
 byId('autoRotate').addEventListener('change',e=>{state.rotate=e.target.checked;orbit.autoRotate=state.rotate;orbit.autoRotateSpeed=1.35});
 byId('downloadGlb').addEventListener('click',downloadOriginalGlb);
 byId('exportModified').addEventListener('click',exportModifiedGlb);
 byId('screenshot').addEventListener('click',()=>{
   try{renderer.render(scene,camera);const a=document.createElement('a');a.download='sol_e_manga_visualizacao.png';a.href=renderer.domElement.toDataURL('image/png');a.click();setStatus('Imagem do ângulo atual gerada');}
   catch(e){setStatus('Não foi possível salvar a captura neste navegador')}
 });
}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function downloadOriginalGlb(){
 if(!glbBuffer)return;
 downloadBlob(new Blob([glbBuffer],{type:'model/gltf-binary'}),'SOL_E_MANGA_Modelo_3D.glb');
 setStatus('Download GLB solicitado • 194 malhas reais');
}
async function exportModifiedGlb(){
 if(!root)return;
 setStatus('Preparando exportação das alterações...');
 const exporter=new GLTFExporter();
 try{
  await new Promise((resolve,reject)=>exporter.parse(root,binary=>{
    downloadBlob(new Blob([binary],{type:'model/gltf-binary'}),'SOL_E_MANGA_Visualizacao_Editada.glb');
    resolve();
  },reject,{binary:true,onlyVisible:true,trs:true,maxTextureSize:2048}));
  setStatus('Exportação GLB atualizada solicitada');
 }catch(e){console.error(e);setStatus('Erro ao exportar; use o botão Baixar GLB original');}
}
const ray=new THREE.Raycaster(),mouse=new THREE.Vector2();let pointerDown=null;
canvas.addEventListener('pointerdown',e=>{pointerDown=[e.clientX,e.clientY]});
function pickNode(e){
 if(!root||!pointerDown||Math.hypot(e.clientX-pointerDown[0],e.clientY-pointerDown[1])>8)return;
 const r=canvas.getBoundingClientRect();mouse.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);
 ray.setFromCamera(mouse,camera);
 const hits=ray.intersectObjects(nodes.filter(n=>n.visible),false);
 if(hits.length){const n=hits[0].object;const msg=n.name.replace(/_\d{3}$/,'').replace(/^(P\d+|M\d+) /,'');byId('itemInfo').innerHTML=`<strong>${escapeHTML(msg)}</strong><span>Peça do modelo 3D • toque em outro componente para inspecionar</span>`;}
}
function animate(){
 requestAnimationFrame(animate);
 const dt=Math.min(clock.getDelta(),.06);
 for(let i=motion.length-1;i>=0;i--){
   const m=motion[i];const old=m.target[m.property];
   const v=THREE.MathUtils.damp(old,m.to,m.speed,dt);m.target[m.property]=v;
   if(Math.abs(m.to-v)<.001){m.target[m.property]=m.to;motion.splice(i,1)}
 }
 orbit.update();renderer.render(scene,camera);
}
init();