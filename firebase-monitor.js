/* Monitoring Simulasi Kredit - Firebase browser SDK; no passwords or bank private keys embedded. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import {
  getFirestore, doc, getDocFromServer, getDocs, collection, query,
  orderBy, limit, startAfter, where, Timestamp, addDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js';

// Web configuration is a public project identifier, not an administrator credential.
const firebaseConfig = {
  apiKey: 'AIzaSyCmnNBGBYkcYjwy3TmvWChKOoEp-bcXnoM',
  authDomain: 'monitoring-simulasi-kredit.firebaseapp.com',
  projectId: 'monitoring-simulasi-kredit',
  storageBucket: 'monitoring-simulasi-kredit.firebasestorage.app',
  messagingSenderId: '1020478516816',
  appId: '1:1020478516816:web:ec90cb83008366b85b2b55'
};
const $ = id => document.getElementById(id);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let currentUser = null;
let currentProfile = null;
let adminMode = false;
let lastAccessUser = null;
let lastList = [];
let profileMap = new Map();
const rupiah = n => 'Rp' + Number(n || 0).toLocaleString('id-ID', {maximumFractionDigits: 0});
const dateFmt = dt => dt?.toDate ? dt.toDate().toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'}) : '—';
const display = (el, text, danger = false) => { el.textContent = text; el.classList.toggle('monitor-error', danger); };
const hidePrivate = () => {
  document.body.classList.add('monitor-locked');
  $('monitorAccess').hidden = false;
  $('monitorAppControls').hidden = true;
  $('monitorAdmin').hidden = true;
  document.body.classList.remove('monitor-admin-open');
  currentUser = null; currentProfile = null; adminMode = false;
  window.dispatchEvent(new CustomEvent('sim-monitor-identity',{detail:{signedIn:false}}));
};
const showPrivate = () => {
  document.body.classList.remove('monitor-locked');
  $('monitorAccess').hidden = true;
  $('monitorAppControls').hidden = false;
  $('monitorWho').textContent = `${currentProfile.fullName} · ${currentProfile.branch}`;
  $('monitorAdminButton').hidden = !adminMode;
  // Petugas/cabang diambil dari profil server agar tidak dapat diganti lewat formulir biasa.
  $('docOfficer').value = currentProfile.fullName;
  $('docUnit').value = currentProfile.branch;
  $('docOfficer').readOnly = true;
  $('docUnit').readOnly = true;
  window.SIM_MONITOR_UPDATE_IDENTITY?.();
  window.dispatchEvent(new CustomEvent('sim-monitor-identity',{detail:{signedIn:true}}));
};
async function checkIdentity(user) {
  // Server-only reads: online verification required; no access from stale offline profile cache.
  const ref = doc(db,'users',user.uid);
  const p = await getDocFromServer(ref);
  if (!p.exists() || p.data().active !== true || !['admin','ao'].includes(p.data().role)) {
    throw new Error('Akun belum memiliki profil aktif di Firebase. Hubungi administrator.');
  }
  const profile = p.data();
  if (typeof profile.fullName !== 'string' || typeof profile.branch !== 'string' || !profile.fullName.trim() || !profile.branch.trim()) {
    throw new Error('Profil petugas belum lengkap (nama atau cabang).');
  }
  const adminDoc = await getDocFromServer(doc(db,'admins',user.uid));
  return {profile, isAdmin:adminDoc.exists()};
}
async function audit(action) {
  if (!currentUser || !currentProfile) return false;
  const sample = window.SIM_MONITOR_GET_SNAPSHOT?.();
  if (!sample) return false;
  // Each record retains only the requested data. No birth dates, account numbers,
  // KTP, passwords, full amortization schedules, or attached borrower documents.
  const payload = {
    uid: currentUser.uid,
    reference: String(sample.reference || '').slice(0,55),
    product: String(sample.product || '').slice(0,45),
    action,
    createdAt: serverTimestamp(),
    debtorName: action === 'open_app' ? '' : String(sample.debtorName || '').slice(0,75),
    salary: action === 'open_app' ? 0 : Number(sample.salary || 0),
    principal: action === 'open_app' ? 0 : Number(sample.principal || 0),
    netDisbursement: action === 'open_app' ? 0 : Number(sample.netDisbursement || 0),
    payment: action === 'open_app' ? 0 : Number(sample.payment || 0)
  };
  await addDoc(collection(db,'activities'),payload);
  return true;
}
async function saveSimulation() {
  if (!currentUser || !currentProfile) return;
  if (!window.SIM_MONITOR_CAN_SAVE?.()) {
    display($('monitorSaveStatus'),'Tidak dapat menyimpan: lengkapi simulasi dan pastikan batas usia/IDIR dipenuhi.',true);
    return;
  }
  if (!(window.SIM_MONITOR_GET_SNAPSHOT?.()?.debtorName||'').trim()) {
    display($('monitorSaveStatus'),'Isi nama calon debitur sebelum menyimpan.',true);
    if(!window.SIM_PLUS_ACTIVE)$('docDebtor').focus(); return;
  }
  const btn = $('monitorSave');
  btn.disabled = true;
  display($('monitorSaveStatus'),'Menyimpan data ke Firebase…');
  try {
    await audit('save_simulation');
    display($('monitorSaveStatus'),'Tersimpan. Nomor referensi tercatat pada monitoring administrator.');
    if(window.SIM_PLUS_ACTIVE)$('plusSaveStatus').textContent='Simulasi berhasil disimpan pada monitoring Firebase.';
  } catch (e) {
    display($('monitorSaveStatus'),'Gagal menyimpan: ' + friendly(e),true);
    if(window.SIM_PLUS_ACTIVE)$('plusSaveStatus').textContent='Gagal menyimpan: '+friendly(e);
  } finally { btn.disabled = false; }
}
function friendly(e) {
  const code = String(e?.code || '');
  if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password') || code.includes('auth/user-not-found')) return 'Email atau password salah.';
  if (code.includes('auth/too-many-requests')) return 'Terlalu banyak percobaan login. Coba kembali nanti.';
  if (code.includes('auth/unauthorized-domain')) return 'Domain GitHub Pages belum ditambahkan pada Firebase Authentication → Settings → Authorized domains.';
  if (code.includes('permission-denied')) return 'Akses database ditolak. Periksa versi Security Rules yang baru.';
  if (code.includes('unavailable') || code.includes('network')) return 'Koneksi Firebase tidak tersedia. Periksa internet.';
  return e?.message || 'Terjadi kesalahan. Periksa pengaturan dan koneksi.';
}
setPersistence(auth,browserLocalPersistence).catch(console.warn);
$('monitorLoginForm').addEventListener('submit',async e => {
  e.preventDefault();
  const btn = $('monitorLoginSubmit'); btn.disabled = true;
  display($('monitorLoginStatus'),'Memeriksa akun…');
  try {
    await signInWithEmailAndPassword(auth,$('monitorEmail').value.trim(),$('monitorPassword').value);
    $('monitorPassword').value = '';
  } catch (error) {
    display($('monitorLoginStatus'),friendly(error),true);
  } finally {btn.disabled = false;}
});
$('monitorLogout').addEventListener('click',async () => {
  $('monitorAdmin').hidden = true;
  await signOut(auth);
  lastAccessUser = null;
  // Clear borrower information when switching AO on a shared device.
  $('form').reset(); $('docDebtor').value = '';
  $('docOfficer').readOnly = false; $('docUnit').readOnly = false;
  $('docOfficer').value = ''; $('docUnit').value = '';
  window.SIM_MONITOR_RESET?.();
  hidePrivate();
  display($('monitorLoginStatus'),'Anda telah keluar dari aplikasi.');
});
$('monitorSave').addEventListener('click',saveSimulation);
$('reset').addEventListener('click',() => {
  if (!currentProfile) return;
  $('docOfficer').value = currentProfile.fullName;
  $('docUnit').value = currentProfile.branch;
  window.SIM_MONITOR_UPDATE_IDENTITY?.();
});
$('monitorAdminButton').addEventListener('click', () => {
  $('monitorAdmin').hidden = false;
  document.body.classList.add('monitor-admin-open');
  loadDashboard();
});
$('monitorCloseAdmin').addEventListener('click', () => {
  $('monitorAdmin').hidden = true;
  document.body.classList.remove('monitor-admin-open');
});
$('monitorRefresh').addEventListener('click',loadDashboard);
$('monitorFilter').addEventListener('input',()=>{monitorPage=0;renderDashboard();});
for (const key of ['monitorBranch','monitorAO','monitorProduct','monitorAction']) $(key).addEventListener('change',()=>{monitorPage=0;renderDashboard();});
for (const key of ['monitorFrom','monitorTo']) $(key).addEventListener('change',loadDashboard);
$('monitorResetFilters').addEventListener('click',()=>{
  monitorPage=0;
  $('monitorFilter').value='';
  for (const key of ['monitorBranch','monitorAO','monitorProduct','monitorAction']) $(key).value='';
  // Kosong berarti seluruh periode; tetap diambil bertahap dari server.
  $('monitorFrom').value='';$('monitorTo').value='';loadDashboard();
});
$('monitorPageSize').addEventListener('change',()=>{monitorPage=0;renderDashboard();});
$('monitorPrevPage').addEventListener('click',()=>{monitorPage=Math.max(0,monitorPage-1);renderDashboard();});
$('monitorNextPage').addEventListener('click',()=>{monitorPage++;renderDashboard();});
$('monitorExportExcel').addEventListener('click',()=>exportDashboard('excel'));
$('monitorExportCSV').addEventListener('click',()=>exportDashboard('csv'));

// Printing/export logs represent a requested action, not proof of a finished printout.
const auditButtons = {
  print: 'print_summary',
  schedulePrintNow: 'print_schedule',
  csv: 'download_csv'
};
document.addEventListener('click',e => {
  const target = e.target.closest('button');
  if (!target || !(target.id in auditButtons)) return;
  if (!currentUser || !window.SIM_MONITOR_CAN_SAVE?.()) return;
  audit(auditButtons[target.id]).catch(err => console.warn('Pencatatan permintaan cetak gagal:',friendly(err)));
},true);

onAuthStateChanged(auth,async user => {
  hidePrivate();
  if (!user) { display($('monitorLoginStatus'),'Masukkan email dan password petugas.'); return; }
  display($('monitorLoginStatus'),'Memeriksa profil dan izin akses…');
  try {
    const info = await checkIdentity(user);
    // Protect against asynchronous race when user logs out during profile fetch.
    if (auth.currentUser?.uid !== user.uid) return;
    currentUser = user; currentProfile = info.profile; adminMode = info.isAdmin;
    showPrivate();
    if (lastAccessUser !== user.uid) {
      lastAccessUser = user.uid;
      audit('open_app').catch(e => console.warn('Pencatatan akses tidak berhasil:',friendly(e)));
    }
  } catch (error) {
    display($('monitorLoginStatus'),friendly(error),true);
    await signOut(auth);
  }
});

// Semua laporan dimuat bertahap berdasarkan periode, bukan dibatasi 300 aktivitas.
// Akses data tetap diawasi Firestore Security Rules (hanya admin).
let dashboardVersion = 0;
let dashboardLoading = false;
let dashboardReady = false;
let monitorPage = 0;
let savedState = {activities:[],saved:[],ao:[],branch:[]};
const isoLocal = d => [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
const firstDay = new Date();firstDay.setDate(1);
$('monitorFrom').value=isoLocal(firstDay);
$('monitorTo').value=isoLocal(new Date());
const num = n => Number.isFinite(Number(n)) ? Number(n) : 0;
const sortID = (a,b) => String(a).localeCompare(String(b),'id');
const getPerson = e => profileMap.get(e.uid) || {};
function putOptions(id, options, allText) {
  const select=$(id), current=select.value;
  select.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent=allText;select.appendChild(empty);
  for(const [value,label] of options){const o=document.createElement('option');o.value=value;o.textContent=label;select.appendChild(o);}
  if([...select.options].some(x=>x.value===current))select.value=current;
}
function refreshOptions() {
  const profiles=[...profileMap.entries()];
  const branch=[...new Set(profiles.map(x=>x[1].branch).filter(Boolean))].sort(sortID);
  putOptions('monitorBranch',branch.map(b=>[b,b]),'Semua cabang');
  const people=profiles.filter(x=>x[1].fullName).sort((a,b)=>sortID(a[1].fullName,b[1].fullName));
  putOptions('monitorAO',people.map(([id,p])=>[id,`${p.fullName} · ${p.branch||'-'}`]),'Semua AO / Petugas');
  const products=[...new Set(lastList.map(x=>x.product).filter(Boolean))].sort(sortID);
  putOptions('monitorProduct',products.map(p=>[p,p]),'Semua produk');
}
async function loadDashboard() {
  if(!adminMode || dashboardLoading)return;
  const from=$('monitorFrom').value,to=$('monitorTo').value;
  if(from&&to&&from>to){display($('monitorDashStatus'),'Tanggal mulai harus sebelum atau sama dengan tanggal akhir.',true);return;}
  const version=++dashboardVersion;
  dashboardLoading=true;dashboardReady=false;
  for(const id of ['monitorRefresh','monitorExportExcel','monitorExportCSV'])$(id).disabled=true;
  display($('monitorDashStatus'),'Memuat seluruh aktivitas untuk periode pilihan…');
  lastList=[];
  try {
    const docs=await getDocs(collection(db,'users'));
    profileMap=new Map(docs.docs.map(d=>[d.id,d.data()]));
    const constraints=[];
    if(from)constraints.push(where('createdAt','>=',Timestamp.fromDate(new Date(from+'T00:00:00'))));
    if(to){const after=new Date(to+'T00:00:00');after.setDate(after.getDate()+1);constraints.push(where('createdAt','<',Timestamp.fromDate(after)));}
    // Pengurutan pada timestamp memastikan pagination tidak melewati catatan.
    constraints.push(orderBy('createdAt','desc'));
    let afterDoc=null;
    do {
      const args=[collection(db,'activities'),...constraints];
      if(afterDoc)args.push(startAfter(afterDoc));
      args.push(limit(500));
      const batch=await getDocs(query(...args));
      if(version!==dashboardVersion)return;
      lastList.push(...batch.docs.map(d=>({id:d.id,...d.data()})));
      display($('monitorDashStatus'),`Membaca periode pilihan… ${lastList.length.toLocaleString('id-ID')} aktivitas`);
      afterDoc=batch.docs.length===500?batch.docs.at(-1):null;
      if(!afterDoc)break;
    }while(true);
    dashboardReady=true;
    refreshOptions();
    renderDashboard();
  }catch(error){
    dashboardReady=false;lastList=[];renderDashboard();
    display($('monitorDashStatus'),'Gagal memuat laporan lengkap: '+friendly(error),true);
  }finally{
    dashboardLoading=false;$('monitorRefresh').disabled=false;
    $('monitorExportExcel').disabled=!dashboardReady;
    $('monitorExportCSV').disabled=!dashboardReady;
  }
}
function dashboardFiltered(){
  const text=$('monitorFilter').value.trim().toLocaleLowerCase('id');
  const branch=$('monitorBranch').value,ao=$('monitorAO').value,prod=$('monitorProduct').value,act=$('monitorAction').value;
  return lastList.filter(e=>{
    const p=getPerson(e);
    if(branch && p.branch!==branch)return false;
    if(ao && e.uid!==ao)return false;
    if(prod && e.product!==prod)return false;
    if(act && e.action!==act)return false;
    if(!text)return true;
    return [p.fullName,p.branch,e.reference,e.debtorName,e.product,e.action].some(v=>String(v||'').toLocaleLowerCase('id').includes(text));
  });
}
function summarize(rows){
  const saved=new Map();
  // Histori diurutkan terbaru dahulu; simpan terakhir per pasangan petugas + referensi.
  for(const e of rows){
    if(e.action!=='save_simulation')continue;
    const key=e.uid+'|'+e.reference;
    if(!saved.has(key))saved.set(key,e);
  }
  const byAO=new Map(),byBranch=new Map();
  function initAO(id){
    if(!byAO.has(id)){
      const p=profileMap.get(id)||{};
      byAO.set(id,{uid:id,name:p.fullName||'Tidak diketahui',branch:p.branch||'Tidak diketahui',access:0,count:0,principal:0,net:0});
    }
    return byAO.get(id);
  }
  for(const e of rows){if(e.action==='open_app')initAO(e.uid).access++;}
  for(const e of saved.values()){
    const entry=initAO(e.uid);entry.count++;entry.principal+=num(e.principal);entry.net+=num(e.netDisbursement);
  }
  // Baris AO yang tidak memiliki aktivitas tidak ditampilkan sebagai kinerja.
  for(const a of byAO.values()){
    const k=a.branch;
    if(!byBranch.has(k))byBranch.set(k,{name:k,people:new Set(),access:0,count:0,principal:0,net:0});
    const b=byBranch.get(k);b.people.add(a.uid);b.access+=a.access;b.count+=a.count;b.principal+=a.principal;b.net+=a.net;
  }
  return {activities:rows,saved:[...saved.values()],ao:[...byAO.values()].sort((a,b)=>sortID(a.name,b.name)),branch:[...byBranch.values()].sort((a,b)=>sortID(a.name,b.name))};
}
function addTableRow(tbody,vals){
  const tr=document.createElement('tr');
  for(const val of vals){const td=document.createElement('td');td.textContent=String(val);tr.appendChild(td);}tbody.appendChild(tr);
}
function fillRecap(tbody,data,callback,columns){
  tbody.replaceChildren();for(const e of data)addTableRow(tbody,callback(e));
  if(!data.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=columns;td.textContent='Tidak ada aktivitas sesuai filter.';tr.appendChild(td);tbody.appendChild(tr);}
}
function renderDashboard() {
  const data=dashboardFiltered(),summary=summarize(data);
  savedState=summary;
  $('monitorMetricUser').textContent=String(profileMap.size);
  $('monitorMetricAccess').textContent=String(data.filter(e=>e.action==='open_app').length);
  $('monitorMetricSaved').textContent=String(summary.saved.length);
  $('monitorMetricPrincipal').textContent=rupiah(summary.saved.reduce((a,e)=>a+num(e.principal),0));
  const tbody=$('monitorHistory');tbody.replaceChildren();
  const pageSize=Number($('monitorPageSize').value)||50;
  const maxPage=Math.max(0,Math.ceil(data.length/pageSize)-1);
  monitorPage=Math.min(monitorPage,maxPage);
  const from=monitorPage*pageSize, to=Math.min(from+pageSize,data.length);
  $('monitorPageInfo').textContent=data.length ? `${(from+1).toLocaleString('id-ID')}–${to.toLocaleString('id-ID')} dari ${data.length.toLocaleString('id-ID')} aktivitas`:'0 aktivitas';
  $('monitorPrevPage').disabled=monitorPage===0;
  $('monitorNextPage').disabled=monitorPage>=maxPage;
  for(const e of data.slice(from,to)){
    const p=getPerson(e);
    addTableRow(tbody,[dateFmt(e.createdAt),p.fullName||'—',p.branch||'—',e.action||'—',e.reference||'—',e.debtorName||'—',e.product||'—',rupiah(e.salary),rupiah(e.principal),rupiah(e.payment),rupiah(e.netDisbursement)]);
  }
  if(!data.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=11;td.textContent='Tidak ada aktivitas sesuai filter.';tr.appendChild(td);tbody.appendChild(tr);}
  fillRecap($('monitorRecapAO'),summary.ao,e=>[e.name,e.branch,e.access,e.count,rupiah(e.principal),rupiah(e.net)],6);
  fillRecap($('monitorRecapBranch'),summary.branch,e=>[e.name,e.people.size,e.access,e.count,rupiah(e.principal),rupiah(e.net)],6);
  if(dashboardReady)display($('monitorDashStatus'),`${data.length.toLocaleString('id-ID')} aktivitas sesuai filter · ${lastList.length.toLocaleString('id-ID')} aktivitas dibaca dari periode · ${Math.min(data.length,pageSize)} baris per halaman. Ekspor mencakup semua hasil filter.`);
}
function makeReportTables(){
  const data=savedState;
  const header=['Waktu','Nama Petugas','Cabang','Aktivitas','No. Referensi','Nama Debitur','Produk','Gaji / THP (Rp)','Plafon (Rp)','Angsuran (Rp)','Dana Bersih (Rp)'];
  const activity=data.activities.map(e=>{
    const p=getPerson(e);
    return [dateFmt(e.createdAt),p.fullName||'',p.branch||'',e.action||'',e.reference||'',e.debtorName||'',e.product||'',num(e.salary),num(e.principal),num(e.payment),num(e.netDisbursement)];
  });
  const ao=data.ao.map(e=>[e.name,e.branch,e.access,e.count,e.principal,e.net]);
  const branch=data.branch.map(e=>[e.name,e.people.size,e.access,e.count,e.principal,e.net]);
  const notes=[
    ['Laporan','Monitoring Simulasi Kredit — Area 2'],
    ['Tanggal unduh',new Date().toLocaleString('id-ID')],
    ['Awal periode',$('monitorFrom').value||'Seluruh riwayat'],
    ['Akhir periode',$('monitorTo').value||'Seluruh riwayat'],
    ['Filter cabang',$('monitorBranch').selectedOptions[0]?.textContent||'Semua'],
    ['Filter AO',$('monitorAO').selectedOptions[0]?.textContent||'Semua'],
    ['Filter produk',$('monitorProduct').value||'Semua'],
    ['Filter aktivitas',$('monitorAction').value||'Semua'],
    ['Pencarian',$('monitorFilter').value||'Tidak ada'],
    ['Jumlah aktivitas sesuai filter',data.activities.length],
    ['Simulasi unik',data.saved.length],
    ['Metode total plafon','Catatan save_simulation terbaru per UID + referensi. BUKAN realisasi pencairan.'],
    ['Penting','Laporan memuat informasi pribadi dan keuangan, hanya untuk admin yang berwenang.'],
    ['Batas dashboard','Tampilan tabel maksimal 300 baris; ekspor menggunakan seluruh data hasil filter.'],
    ['Aktivitas cetak','Permintaan cetak, bukan bukti PDF berhasil dicetak.'],
    ['Cakupan','Tanggal mengacu timestamp pencatatan aktivitas, bukan tanggal akad atau pencairan.']
  ];
  return [
    {name:'Aktivitas',headers:header,rows:activity,moneyCols:[7,8,9,10]},
    {name:'Rekap AO',headers:['Nama AO','Cabang','Jumlah akses','Simulasi unik','Total plafon (Rp)','Total dana bersih (Rp)'],rows:ao,moneyCols:[4,5]},
    {name:'Rekap Cabang',headers:['Cabang','AO dengan aktivitas','Jumlah akses','Simulasi unik','Total plafon (Rp)','Total dana bersih (Rp)'],rows:branch,moneyCols:[4,5]},
    {name:'Keterangan',headers:['Komponen','Keterangan'],rows:notes,moneyCols:[]}
  ];
}
function exportDashboard(format){
  if(!adminMode||!currentUser||!dashboardReady||dashboardLoading)return;
  if(!window.SIM_REPORT_EXPORT){display($('monitorDashStatus'),'Komponen ekspor belum dimuat; refresh aplikasi terlebih dahulu.',true);return;}
  if(!window.confirm('Laporan berisi nama debitur dan data keuangan. Unduh hanya ke perangkat yang diizinkan dan simpan sesuai kebijakan bank. Lanjutkan?'))return;
  const sheets=makeReportTables(),api=window.SIM_REPORT_EXPORT;
  const name='Monitoring_Simulasi_Kredit_'+new Date().toISOString().slice(0,10);
  try {
    if(format==='excel')api.download(api.excelUnified(sheets,{registeredUsers:profileMap.size}),name+'_MONITORING_TERPADU.xlsx');
    else api.download(api.csvArchive(sheets),name+'_CSV.zip');
    display($('monitorDashStatus'),`Berhasil menyiapkan ${format==='excel'?'Excel satu sheet':'ZIP CSV'}: ${savedState.activities.length} aktivitas, ${savedState.ao.length} rekap AO, ${savedState.branch.length} rekap cabang.`);
  }catch(error){display($('monitorDashStatus'),'Gagal membuat file: '+(error?.message||'Kesalahan ekspor'),true);}
}

window.SIM_MONITOR_AUDIT = audit;
