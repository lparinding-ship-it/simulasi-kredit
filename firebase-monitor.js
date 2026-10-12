/* Monitoring Simulasi Kredit - Firebase browser SDK; no passwords or bank private keys embedded. */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged,
  setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js';
import {
  getFirestore, doc, getDocFromServer, getDocs, collection, query,
  orderBy, limit, addDoc, serverTimestamp
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
$('monitorFilter').addEventListener('input',renderDashboard);

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

async function loadDashboard() {
  if (!adminMode) return;
  const button = $('monitorRefresh'); button.disabled = true;
  display($('monitorDashStatus'),'Mengambil aktivitas terbaru…');
  try {
    const [profiles,logs] = await Promise.all([
      getDocs(collection(db,'users')),
      getDocs(query(collection(db,'activities'),orderBy('createdAt','desc'),limit(300)))
    ]);
    profileMap = new Map(profiles.docs.map(d => [d.id,d.data()]));
    lastList = logs.docs.map(d => ({id:d.id,...d.data()}));
    display($('monitorDashStatus'),`Menampilkan maksimal 300 aktivitas terbaru. ${lastList.length} berhasil dibaca.`);
    renderDashboard();
  } catch(error) {
    display($('monitorDashStatus'),friendly(error),true);
  } finally {button.disabled = false;}
}
function renderDashboard() {
  const filter = $('monitorFilter').value.trim().toLowerCase();
  const rows = lastList.filter(e => {
    const profile = profileMap.get(e.uid) || {};
    return [profile.fullName,profile.branch,e.reference,e.debtorName,e.product,e.action].some(v => String(v || '').toLowerCase().includes(filter));
  });
  // Use the newest record per (user, reference), avoiding duplicate nominal totals.
  const savedByReference = new Map();
  for (const e of rows) {
    const k = e.uid + '|' + e.reference;
    if (e.action === 'save_simulation' && !savedByReference.has(k)) savedByReference.set(k,e);
  }
  $('monitorMetricUser').textContent = String(profileMap.size);
  $('monitorMetricAccess').textContent = String(rows.filter(e=>e.action==='open_app').length);
  $('monitorMetricSaved').textContent = String(savedByReference.size);
  $('monitorMetricPrincipal').textContent = rupiah([...savedByReference.values()].reduce((a,e)=>a+Number(e.principal||0),0));
  const tbody = $('monitorHistory'); tbody.replaceChildren();
  for (const e of rows) {
    const p = profileMap.get(e.uid) || {};
    const tr = document.createElement('tr');
    const cols = [dateFmt(e.createdAt),p.fullName || '—',p.branch || '—',e.action || '—',e.reference || '—',e.debtorName || '—',e.product || '—',rupiah(e.salary),rupiah(e.principal),rupiah(e.payment),rupiah(e.netDisbursement)];
    for (const value of cols) { const td=document.createElement('td');td.textContent=value;tr.appendChild(td); }
    tbody.appendChild(tr);
  }
  if (!rows.length) {
    const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=11;
    td.textContent='Belum ada aktivitas yang sesuai filter.';td.style.textAlign='center';tr.appendChild(td);tbody.appendChild(tr);
  }
}

window.SIM_MONITOR_AUDIT = audit;
