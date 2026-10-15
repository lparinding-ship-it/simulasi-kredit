/* Firebase Spark edition: Administration of Firestore AO profiles only.
   Auth accounts must be created/deleted in Firebase Console (Authentication > Users).
   No Cloud Functions, no Admin SDK credentials in the browser. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const offline=!document.querySelector('script[src="./firebase-monitor.js"]');
 const demoKey='SIM_UJI_USER_AO_SPARK_V1';
 const escapeHTML=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const category=t=>t==='funding'?'AO Funding':t==='lending'?'AO Lending':'Belum dikategorikan';
 let users=[],editing='',busy=false;
 const msg=(text,err=false)=>{if($('umStatus')){$('umStatus').textContent=text;$('umStatus').classList.toggle('error',err);}};
 const adminOK=()=>offline||!!window.SIM_FIREBASE_BRIDGE?.identity()?.isAdmin;
 function localRead(){try{return JSON.parse(localStorage.getItem(demoKey)||'[]');}catch{return [];}}
 function localWrite(){localStorage.setItem(demoKey,JSON.stringify(users));}
 function busyState(v){busy=v;for(const id of ['umSubmit','umRefresh','umCancelEdit'])$(id).disabled=v;for(const btn of $('umBody').querySelectorAll('button'))btn.disabled=v;}
 async function invoke(operation,data={}){
   if(!offline){const bridge=window.SIM_FIREBASE_BRIDGE;if(!bridge?.identity()?.isAdmin||typeof bridge.manageUser!=='function')throw Error('Hanya Administrator yang dapat mengelola profil AO.');return bridge.manageUser(operation,data);}
   users=localRead();
   if(operation==='list')return {users};
   const now=new Date().toISOString();
   if(operation==='create'){
     const uid=data.uid||'UJI'+Math.random().toString(36).slice(2,22);
     if(users.some(u=>u.uid===uid))throw Error('UID sudah memiliki profil.');
     users.push({...data,uid,role:'ao',createdAt:now});localWrite();return {ok:true,uid};
   }
   const i=users.findIndex(u=>u.uid===data.uid);if(i<0)throw Error('Profil tidak ditemukan.');
   if(operation==='updateProfile')users[i]={...users[i],fullName:data.fullName,branch:data.branch,aoType:data.aoType};
   else if(operation==='setActive')users[i]={...users[i],active:data.active};
   else if(operation==='revoke')users.splice(i,1);
   else throw Error('Operasi tidak dikenal.');
   localWrite();return {ok:true};
 }
 function display(){
  const q=$('umSearch').value.trim().toLocaleLowerCase('id');
  const filtered=users.filter(u=>[u.fullName,u.email,u.branch,category(u.aoType),u.uid].join(' ').toLocaleLowerCase('id').includes(q));
  $('umCount').textContent=`(${users.length} profil AO)`;
  $('umBody').innerHTML=filtered.length?filtered.map(u=>`<tr data-uid="${escapeHTML(u.uid)}">
  <td><span class="um-name">${escapeHTML(u.fullName)}</span><div style="font-size:11px;color:#61778c;margin-top:4px">${escapeHTML(u.email||'Email belum dicatat')}</div><div style="font-size:10px;color:#8191a4;margin-top:2px">UID: ${escapeHTML(u.uid)}</div></td>
  <td>${escapeHTML(category(u.aoType))}</td><td>${escapeHTML(u.branch)}</td>
  <td><span class="um-state ${u.active===true||u.active==='true'?'':'off'}">${u.active===true||u.active==='true'?'Aktif':'Nonaktif'}</span></td>
  <td><div class="um-row-actions"><button class="um-btn" type="button" data-act="edit">Ubah</button>
  <button class="um-btn" type="button" data-act="toggle">${u.active===true||u.active==='true'?'Nonaktifkan':'Aktifkan'}</button>
  <button class="um-btn danger" type="button" data-act="revoke">Cabut Akses</button></div></td></tr>`).join(''):'<tr><td colspan="5">Tidak ada profil AO sesuai pencarian.</td></tr>';
 }
 async function reload(){if(!adminOK()){msg('Akses Administrator ditolak.',true);return;}
   busyState(true);msg('Memuat profil AO…');try{const res=await invoke('list');users=Array.isArray(res.users)?res.users:[];
   users.sort((a,b)=>String(a.fullName||'').localeCompare(String(b.fullName||''),'id'));display();
   msg(offline?'MODE UJI: semua perubahan hanya tersimpan di browser lokal.':`${users.length} profil AO terbaca dari Cloud Firestore.`);
   }catch(e){msg('Gagal memuat: '+(e.message||e),true);}finally{busyState(false);}}
 function reset(){editing='';$('umForm').reset();$('umUid').readOnly=false;$('umEmail').readOnly=false;$('umActive').disabled=false;
  $('umUid').required=!offline;$('umSubmit').textContent='+ Daftarkan Profil AO';$('umCancelEdit').hidden=true;}
 async function submit(event){event.preventDefault();if(!adminOK()){msg('Akses Administrator ditolak.',true);return;}
   const uid=$('umUid').value.trim(),email=$('umEmail').value.trim().toLowerCase(),fullName=$('umName').value.trim(),branch=$('umBranch').value.trim(),aoType=$('umType').value,active=$('umActive').value==='active';
   if((!editing&&!offline&&!/^[a-zA-Z0-9_-]{8,160}$/.test(uid))||fullName.length<2||fullName.length>75||branch.length<2||branch.length>75||!['lending','funding'].includes(aoType)||
      (email.length>0&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254))){msg('Periksa UID, nama, email, kategori AO, dan cabang.',true);return;}
   busyState(true);msg('Menyimpan profil AO…');
   try{const data={uid:editing||uid,fullName,email,branch,aoType,active};
      if(editing){await invoke('updateProfile',data);}else{await invoke('create',data);}
      reset();await reload();msg(offline?'Profil AO contoh berhasil disimpan.':editing?'Profil AO berhasil diperbarui.':'Profil tersimpan. AO bisa login dengan akun Authentication yang sudah dibuat.');
   }catch(e){msg('Gagal menyimpan: '+(e.message||e),true);}finally{busyState(false);}}
 async function action(event){const b=event.target.closest('button[data-act]');if(!b||busy||!adminOK())return;
   const uid=b.closest('tr')?.dataset.uid,item=users.find(u=>u.uid===uid);if(!item)return;
   if(b.dataset.act==='edit'){editing=item.uid;$('umUid').value=item.uid;$('umUid').readOnly=true;$('umName').value=item.fullName;
     $('umEmail').value=item.email||'';$('umEmail').readOnly=true;$('umBranch').value=item.branch;
     $('umType').value=['lending','funding'].includes(item.aoType)?item.aoType:'lending';$('umActive').value=(item.active===true||item.active==='true')?'active':'inactive';$('umActive').disabled=true;
     $('umSubmit').textContent='Simpan Perubahan';$('umCancelEdit').hidden=false;$('umName').focus();
     msg('Ubah nama, kategori, atau cabang. Status diubah menggunakan tombol tabel.');return;}
   const op=b.dataset.act;
   // Aktivasi/nonaktivasi langsung dari tombol tabel. Hindari confirm() bawaan
   // browser: Firefox dapat memblokir dialog berikutnya sehingga klik terlihat
   // tidak bereaksi. Pencabutan akses tetap memerlukan konfirmasi ganda.
   if(op==='revoke'){
     if(!confirm(`CABUT AKSES profil AO ${item.fullName} (${item.uid}) dari aplikasi? Akun Firebase Authentication tetap ada; untuk menghapus akun login gunakan Firebase Console.`))return;
     if(prompt('Ketik CABUT untuk konfirmasi pencabutan akses profil:')!=='CABUT'){msg('Pencabutan dibatalkan.');return;}
   }
   if(op!=='toggle'&&op!=='revoke')return;
   const nextActive=!(item.active===true||item.active==='true');
   busyState(true);
   msg(op==='revoke'?'Mencabut akses AO…':nextActive?'Mengaktifkan kembali AO…':'Menonaktifkan AO…');
   try{
     await invoke(op==='revoke'?'revoke':'setActive',op==='revoke'?{uid:item.uid}:{uid:item.uid,active:nextActive});
     if(editing===item.uid)reset();
     await reload();
     msg(op==='revoke'
       ?'Akses aplikasi dicabut. Akun Authentication harus dihapus terpisah melalui Firebase Console.'
       :`Akses ${item.fullName} berhasil ${nextActive?'diaktifkan kembali':'dinonaktifkan'}.`);
   }catch(e){msg('Gagal memproses: '+(e.message||e),true);}
   finally{busyState(false);}
 }
 function init(){const nav=$('adminUsersNav'),pane=$('adminUserManagement');if(!nav||!pane)return;
   $('umModeHint').textContent=offline?
     'MODE OFFLINE: data uji lokal, tidak terhubung ke Firebase Authentication atau Firestore.':
     'FIREBASE SPARK GRATIS: Buat akun login di Firebase Authentication → Users, salin UID ke formulir ini, kemudian kelola profil/akses dari Dashboard. Cabut Akses tidak menghapus akun Authentication.';
   nav.addEventListener('click',async()=>{if(!adminOK()){alert('Khusus Administrator.');return;}
     const shown=$('monitorAdmin').classList.toggle('um-open');pane.hidden=!shown;nav.textContent=shown?'← Kembali ke Dashboard':'Manajemen Pengguna';if(shown)await reload();});
   $('umForm').addEventListener('submit',submit);$('umCancelEdit').addEventListener('click',reset);
   $('umRefresh').addEventListener('click',reload);$('umSearch').addEventListener('input',display);$('umBody').addEventListener('click',action);
   $('monitorCloseAdmin')?.addEventListener('click',()=>{pane.hidden=true;$('monitorAdmin').classList.remove('um-open');nav.textContent='Manajemen Pengguna';reset();});
   window.addEventListener('sim-firebase-identity',e=>{if(e.detail?.signedIn)return;pane.hidden=true;$('monitorAdmin').classList.remove('um-open');nav.textContent='Manajemen Pengguna';reset();users=[];display();});
   reset();display();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
