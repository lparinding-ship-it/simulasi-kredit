/* Firebase Auth and Firestore adapter for the production Lending + Funding dashboard.
   Firestore Security Rules are the final authorization barrier; UI is not a security boundary. */
import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {getAuth,signInWithEmailAndPassword,signOut,onAuthStateChanged,setPersistence,browserLocalPersistence} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import {getFirestore,doc,getDocFromServer,getDoc,setDoc,updateDoc,collection,addDoc,getDocs,query,orderBy,limit,writeBatch,serverTimestamp,runTransaction} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';
const firebaseConfig={apiKey:'AIzaSyCmnNBGBYkcYjwy3TmvWChKOoEp-bcXnoM',authDomain:'monitoring-simulasi-kredit.firebaseapp.com',projectId:'monitoring-simulasi-kredit',storageBucket:'monitoring-simulasi-kredit.firebasestorage.app',messagingSenderId:'1020478516816',appId:'1:1020478516816:web:ec90cb83008366b85b2b55'};
const app=initializeApp(firebaseConfig),auth=getAuth(app),db=getFirestore(app),$=id=>document.getElementById(id);
let actor=null;
const allowedActions=new Set(['open_app','save_simulation','print_summary','print_schedule','download_csv','deposito_open','deposito_simulate','deposito_lead_save','deposito_lead_placed','deposito_lead_lost','deposito_lead_delete','deposito_offer','deposito_export','deposito_closing_submitted','deposito_closing_verified','deposito_closing_rejected']);
const formats={'Kredit KPEG Plus Skema-3 (THT)':'KREDIT SKEMA 3 (THT)','KREDIT PEGAWAI PLUS - METODE 1 (3F)':'KREDIT PEGAWAI PLUS METODE 1','KREDIT PEGAWAI PLUS - METODE 2 (3G)':'KREDIT PEGAWAI PLUS METODE 2'};
const friendly=e=>String(e?.code||'').includes('permission-denied')?'Izin Firebase ditolak. Periksa Firestore Rules dan status Admin.':String(e?.code||'').includes('invalid-credential')?'Email atau kata sandi salah.':String(e?.code||'').includes('unauthorized-domain')?'Domain GitHub Pages belum diizinkan di Firebase Authentication.':e?.message||String(e);
const showStatus=(s,bad=false)=>{const el=$('monitorLoginStatus');if(el){el.textContent=s;el.classList.toggle('monitor-error',bad);}};
const fireIdentity=(signedIn)=>window.dispatchEvent(new CustomEvent('sim-firebase-identity',{detail:{signedIn,identity:actor}}));
const eventIdentity=(signedIn)=>window.dispatchEvent(new CustomEvent('sim-monitor-identity',{detail:{signedIn}}));
function clearSession(){actor=null;document.body.classList.add('monitor-locked');$('monitorAccess').hidden=false;$('monitorAppControls').hidden=true;$('monitorAdmin').hidden=true;document.body.classList.remove('monitor-admin-open');$('monitorAdminButton').hidden=true;fireIdentity(false);eventIdentity(false);}
async function loadProfile(user){
  const record=await getDocFromServer(doc(db,'users',user.uid));if(!record.exists())throw Error('Profil petugas tidak ditemukan.');
  const p=record.data();const role=String(p.role||'').toLowerCase();
  const name=String(p.fullName||'').trim(),branch=String(p.branch||p.Branch||'').trim();
  if(p.active!==true||!['ao','admin'].includes(role)||!name||!branch)throw Error('Profil belum aktif atau identitas belum lengkap.');
  const adminDoc=await getDocFromServer(doc(db,'admins',user.uid));
  return {uid:user.uid,fullName:name,branch,isAdmin:adminDoc.exists()};
}
const identity=()=>actor?{...actor}:null;
async function writeActivity({action,product='DEPOSITO ME',amount=0,reference='',debtorName='',salary=0,payment=0,netDisbursement=0}){
  if(!actor)throw Error('Harus login.');if(!allowedActions.has(action))throw Error('Aktivitas tidak dikenali.');
  const num=n=>Math.min(1e15,Math.max(0,Math.round(Number(n)||0)));
  await addDoc(collection(db,'activities'),{
    uid:actor.uid,fullName:actor.fullName,branch:actor.branch,action,
    product:String(formats[product]||product).slice(0,45),reference:String(reference||'').slice(0,55),
    debtorName:String(debtorName||'').slice(0,75),salary:num(salary),principal:num(amount),payment:num(payment),
    netDisbursement:num(netDisbursement),createdAt:serverTimestamp()
  });
}
function iso(value){return value?.toDate?.().toISOString?.()||value||new Date().toISOString();}
async function loadAdmin(){
  if(!actor?.isAdmin)throw Error('Hanya Administrator.');
  // Bounded reads limit cost on large datasets. Filter periods in UI on loaded window.
  const [a,c,d,u]=await Promise.all([
    getDocs(query(collection(db,'activities'),orderBy('createdAt','desc'),limit(500))),
    getDocs(query(collection(db,'depositoClosings'),orderBy('createdAt','desc'),limit(300))),
    getDocs(query(collection(db,'activityDeletionAudit'),orderBy('deletedAt','desc'),limit(50))),
    getDocs(collection(db,'users'))
  ]);
  return {
    activities:a.docs.filter(x=>x.data().deleted!==true).map(x=>({id:x.id,...x.data(),createdAt:iso(x.data().createdAt),product:formats[x.data().product]||x.data().product})),
    closings:c.docs.map(x=>({id:x.id,...x.data(),createdAt:iso(x.data().createdAt),updatedAt:iso(x.data().updatedAt),verifiedAt:x.data().verifiedAt?iso(x.data().verifiedAt):'',history:[{action:'submit'}]})),
    audits:d.docs.map(x=>({id:x.id,...x.data(),at:iso(x.data().deletedAt),count:1})),
    users:u.docs.map(x=>({uid:x.id,fullName:String(x.data().fullName||''),branch:String(x.data().branch||x.data().Branch||'')}))
  };
}
async function deleteActivities(ids,reason){
  if(!actor?.isAdmin)throw Error('Hanya Administrator boleh menghapus aktivitas.');
  if(!Array.isArray(ids)||ids.length<1||ids.length>100)throw Error('Pilih 1–100 aktivitas.');
  reason=String(reason||'').trim();if(reason.length<5||reason.length>160)throw Error('Alasan 5–160 karakter.');
  // Each atomic batch creates an immutable audit document before the corresponding delete.
  for(let start=0;start<ids.length;start+=5){
    const batch=writeBatch(db);
    for(const id of ids.slice(start,start+5)){
      if(!/^[\w-]{8,160}$/.test(id))throw Error('ID aktivitas tidak sah.');
      batch.set(doc(db,'activityDeletionAudit',id),{activityId:id,deletedByUid:actor.uid,deletedByName:actor.fullName,deletedAt:serverTimestamp(),reason});
      batch.delete(doc(db,'activities',id));
    }
    await batch.commit();
  }
}
async function accountId(account){
  const bytes=new TextEncoder().encode('DEP-'+String(account).trim().toUpperCase());
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  return 'CL-'+[...new Uint8Array(hash)].map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,44);
}
async function createClosing(p){
  if(!actor)throw Error('Silakan login.');
  const account=String(p.account||'').trim().toUpperCase(),name=String(p.name||'').trim();
  const amount=Number(p.amount),tenor=Number(p.tenor),rate=Number(p.rate),date=String(p.date||'');
  if(!/^[A-Z0-9-]{4,30}$/.test(account)||name.length<2||name.length>90||!/^\d{4}-\d{2}-\d{2}$/.test(date)||
     !Number.isFinite(amount)||amount<1000||amount>1e15||!Number.isInteger(tenor)||tenor<1||tenor>120||
     !Number.isFinite(rate)||rate<0||rate>100)throw Error('Periksa data closing sebelum mengirim.');
  const id=await accountId(account),ref=doc(db,'depositoClosings',id),old=await getDoc(ref);
  if(old.exists()){
    const prev=old.data();
    if(prev.uid!==actor.uid)throw Error('Rekening sudah dilaporkan AO lain. Hubungi Administrator.');
    if(prev.status!=='rejected')throw Error('Rekening telah dilaporkan dengan status '+prev.status+'.');
    await updateDoc(ref,{name,date,amount,tenor,rate,notes:String(p.notes||'').slice(0,300),status:'pending',updatedAt:serverTimestamp(),verifier:'',verificationReference:'',reviewNote:'',verifiedAt:null});
  }else{
    await setDoc(ref,{uid:actor.uid,fullName:actor.fullName,branch:actor.branch,account,name,date,amount,tenor,rate,notes:String(p.notes||'').slice(0,300),status:'pending',createdAt:serverTimestamp(),updatedAt:serverTimestamp(),verifier:'',verificationReference:'',reviewNote:'',verifiedAt:null});
  }
  return {id};
}
async function reviewClosing(id,decision,reference,note){
  if(!actor?.isAdmin)throw Error('Hanya Administrator.');
  if(!['verify','reject'].includes(decision))throw Error('Keputusan tidak sah.');
  reference=String(reference||'').trim();note=String(note||'').trim();
  if(decision==='verify'&&reference.length<5)throw Error('Referensi pemeriksaan minimal 5 karakter.');
  if(decision==='reject'&&note.length<5)throw Error('Alasan perbaikan minimal 5 karakter.');
  await updateDoc(doc(db,'depositoClosings',id),{status:decision==='verify'?'verified':'rejected',updatedAt:serverTimestamp(),verifiedAt:serverTimestamp(),verifier:actor.fullName,verificationReference:decision==='verify'?reference.slice(0,80):'',reviewNote:note.slice(0,300)});
}
window.SIM_FIREBASE_BRIDGE={identity,loadAdmin,writeActivity,deleteActivities,createClosing,reviewClosing};
window.SIM_MONITOR_AUDIT=async action=>{
  if(!actor||!allowedActions.has(action))return;
  const snap=window.SIM_MONITOR_GET_SNAPSHOT?.()||{};
  return writeActivity({action,reference:snap.reference||'',product:snap.product||'KREDIT CPNS/ASN',debtorName:action==='open_app'?'':snap.debtorName||'',amount:action==='open_app'?0:snap.principal||0,salary:action==='open_app'?0:snap.salary||0,payment:action==='open_app'?0:snap.payment||0,netDisbursement:action==='open_app'?0:snap.netDisbursement||0});
};
$('monitorLoginForm').addEventListener('submit',async e=>{e.preventDefault();const btn=$('monitorLoginSubmit');btn.disabled=true;showStatus('Memeriksa akun Firebase…');try{await signInWithEmailAndPassword(auth,$('monitorEmail').value.trim(),$('monitorPassword').value);$('monitorPassword').value='';}catch(err){showStatus(friendly(err),true);}finally{btn.disabled=false;}});
$('monitorLogout').addEventListener('click',async()=>{await signOut(auth);$('monitorPassword').value='';clearSession();showStatus('Anda telah keluar.');});
$('monitorSave').addEventListener('click',async()=>{
  if(!actor)return;
  if(!window.SIM_MONITOR_CAN_SAVE?.()){ $('monitorSaveStatus').textContent='Lengkapi simulasi dan pastikan data valid.';return;}
  const btn=$('monitorSave');btn.disabled=true;
  try{await window.SIM_MONITOR_AUDIT('save_simulation');$('monitorSaveStatus').textContent='Simulasi tersimpan di Firebase.';}
  catch(err){$('monitorSaveStatus').textContent='Gagal menyimpan: '+friendly(err);}finally{btn.disabled=false;}
});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b||!actor)return;const map={print:'print_summary',schedulePrintNow:'print_schedule',csv:'download_csv'};if(map[b.id])window.SIM_MONITOR_AUDIT(map[b.id]).catch(console.warn);});
setPersistence(auth,browserLocalPersistence).catch(console.warn);
onAuthStateChanged(auth,async user=>{
  clearSession();if(!user){showStatus('Silakan login untuk menggunakan aplikasi.');return;}
  try{
    actor=await loadProfile(user);
    document.body.classList.remove('monitor-locked');$('monitorAccess').hidden=true;$('monitorAppControls').hidden=false;
    $('monitorAdminButton').hidden=!actor.isAdmin;$('monitorWho').textContent=`${actor.fullName} · ${actor.branch}`;
    $('docOfficer').value=actor.fullName;$('docUnit').value=actor.branch;$('docOfficer').readOnly=true;$('docUnit').readOnly=true;
    $('globalProductNav').hidden=false;
    fireIdentity(true);eventIdentity(true);
    await window.SIM_MONITOR_AUDIT('open_app').catch(console.warn);
  }catch(err){await signOut(auth).catch(()=>{});clearSession();showStatus('Akses ditolak: '+friendly(err),true);}
});
