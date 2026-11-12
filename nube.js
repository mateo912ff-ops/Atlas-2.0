// ATLAS IA · cuenta con Google + avisos de seguridad (sin guardar conversaciones)
const cfg={apiKey:"AIzaSyAPgHQY0fkyY7m6XwgaeRpioB06jvLHqTs",authDomain:"atlas-ia-8.firebaseapp.com",projectId:"atlas-ia-8",storageBucket:"atlas-ia-8.firebasestorage.app",messagingSenderId:"473304933095",appId:"1:473304933095:web:3c0f2084b7d81c2d13b842"};
const B='https://www.gstatic.com/firebasejs/10.14.1/';
let db,auth,M,user=null,pend=[],last={};
try{pend=JSON.parse(localStorage.getItem('atlas_rep_pend')||'[]')}catch(e){}
const sp=()=>{try{localStorage.setItem('atlas_rep_pend',JSON.stringify(pend))}catch(e){}};
const id6=u=>'U-'+u.slice(0,6).toUpperCase();
const L=document.querySelector('#stat .lnks');
const mk=t=>{const a=document.createElement('a');a.href='#';a.textContent=t;L.appendChild(a);return a};
const aLog=mk('🔑 Entrar con Google'),aApe=mk('📨 Apelar');aApe.style.display='none';
let strikes=0;
function ui(){aLog.textContent=user?'👤 Salir ('+id6(user.uid)+')':'🔑 Entrar con Google';aApe.style.display=strikes>0?'':'none'}
aLog.onclick=async e=>{e.preventDefault();
  if(!M){alert('Necesitas internet para esto.');return}
  if(user){await M.signOut(auth);return}
  if(!confirm('Al entrar con Google, ATLAS guarda solo un ID y avisos de seguridad (NO tus conversaciones). Un administrador revisa cada aviso; nada se sanciona solo. ¿Continuar?'))return;
  try{await M.signInWithPopup(auth,new M.GoogleAuthProvider())}catch(x){alert('No se pudo entrar. Intenta de nuevo.')}};
aApe.onclick=async e=>{e.preventDefault();
  const m=(prompt('Cuéntale al administrador por qué crees que fue un error:')||'').trim().slice(0,300);
  if(!m)return;
  try{await M.addDoc(M.collection(db,'appeals'),{uid:user.uid,msg:m,t:Date.now(),status:'pending'});alert('Apelación enviada ✅')}catch(x){alert('No se pudo enviar. Intenta con internet.')}};
window.atlasReportar=c=>{if(!user)return;const n=Date.now();if(last[c]&&n-last[c]<6e4)return;last[c]=n;pend.push({why:c,t:n});pend=pend.slice(-20);sp();flush()};
async function flush(){if(!user||!db||!pend.length)return;const l=pend.slice();
  try{for(const r of l)await M.addDoc(M.collection(db,'reports'),{uid:user.uid,why:r.why,t:r.t,status:'pending'});pend=pend.filter(x=>!l.includes(x));sp()}catch(e){}}
async function onUser(u){user=u;strikes=0;window.atlasSuspendido=0;
  if(u){try{const s=await M.getDoc(M.doc(db,'users',u.uid));if(s.exists()){const d=s.data();strikes=d.strikes||0;window.atlasSuspendido=d.until||0}}catch(e){}
    ui();flush();
    if(strikes>0&&!sessionStorage.getItem('atlas_aviso')){sessionStorage.setItem('atlas_aviso','1');
      alert(window.atlasSuspendido>Date.now()?'⏸️ Tu cuenta está suspendida hasta '+new Date(window.atlasSuspendido).toLocaleDateString('es')+'. Puedes apelar con «📨 Apelar».':strikes==1?'⚠️ Advertencia: un administrador revisó un mensaje tuyo. Cuida lo que escribes.':'⚠️ Última advertencia: la próxima puede haber una suspensión temporal. Si fue un error, toca «📨 Apelar».')}
  }else ui()}
(async()=>{try{const[a,b,c]=await Promise.all([import(B+'firebase-app.js'),import(B+'firebase-auth.js'),import(B+'firebase-firestore.js')]);
  const app=a.initializeApp(cfg);auth=b.getAuth(app);db=c.getFirestore(app);M={...c,...b};b.onAuthStateChanged(auth,onUser)}catch(e){}})();
