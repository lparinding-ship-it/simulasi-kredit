/* ONLINE TERPADU. Access is verified through Firebase Authentication and Firestore Rules. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const PRODUCTS=[
    ['KREDIT CPNS/ASN','Kredit CPNS/ASN'],
    ['KREDIT PENSIUN','Kredit Pensiun'],
    ['KREDIT PEGAWAI PLUS METODE 1','Kredit Pegawai Plus — Metode 1 (3F)'],
    ['KREDIT PEGAWAI PLUS METODE 2','Kredit Pegawai Plus — Metode 2 (3G)'],
    ['KREDIT SKEMA 3 (THT)','Kredit Pegawai Plus — Skema 3 (THT)'],
    ['KREDIT USAHA','Kredit Usaha'],
    ['DEPOSITO ME','Deposito ME']
  ];
  const PRODUCT_NAME=new Map(PRODUCTS);
  const NAV_PRODUCT={asn:PRODUCTS[0][0],pension:PRODUCTS[1][0],method1:PRODUCTS[2][0],method2:PRODUCTS[3][0],method3:PRODUCTS[4][0],business:PRODUCTS[5][0],deposito:PRODUCTS[6][0]};
  const ALLOWED=new Set(['open_app','save_simulation','print_summary','print_schedule','download_csv',
    'deposito_open','deposito_simulate','deposito_lead_save','deposito_lead_placed','deposito_lead_lost',
    'deposito_lead_delete','deposito_offer','deposito_export',
    'deposito_closing_submitted','deposito_closing_verified','deposito_closing_rejected']);
  const ACTION_LABELS={open_app:'Buka Produk Kredit',save_simulation:'Simpan Simulasi Kredit',print_summary:'Cetak Ringkasan Kredit',
    print_schedule:'Cetak Jadwal Kredit',download_csv:'Ekspor Jadwal Kredit',deposito_open:'Buka Deposito',
    deposito_simulate:'Simulasi Deposito',deposito_lead_save:'Simpan/Ubah Prospek',
    deposito_lead_placed:'Status Ditempatkan (AO)',deposito_lead_lost:'Status Tidak Jadi',
    deposito_lead_delete:'Hapus Prospek Lokal',deposito_offer:'Buka Penawaran WA',deposito_export:'Ekspor CSV Deposito',
    deposito_closing_submitted:'Laporan Closing Deposito',deposito_closing_verified:'Verifikasi Closing oleh Admin',
    deposito_closing_rejected:'Closing Perlu Perbaikan'};
  const money=n=>'Rp'+Math.round(Number(n)||0).toLocaleString('id-ID');
  const localDate=d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
  const fmtDate=s=>new Date(s).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'});
  const isFunding=e=>e.product===PRODUCTS[6][0];
  const categories={all:'Semua AO',lending:'AO Lending',funding:'AO Funding'};
  const explanations={all:'Gabungan aktivitas kredit dan deposito dari seluruh AO.',
    lending:'Aktivitas pemasaran enam produk kredit saja.',funding:'Aktivitas pemasaran DEPOSITO ME saja.'};
  let activeCategory='all';
  const categoryMatches=e=>activeCategory==='all'||(activeCategory==='funding'?isFunding(e):!isFunding(e));
  const actionsForCategory=()=>Object.entries(ACTION_LABELS).filter(([code])=>activeCategory==='all'||
    (activeCategory==='funding'?code.startsWith('deposito_'):!code.startsWith('deposito_')));
  const productsForCategory=()=>PRODUCTS.filter(([code])=>activeCategory==='all'||
    (activeCategory==='funding'?code==='DEPOSITO ME':code!=='DEPOSITO ME'));

  const rows=[],people=new Map();
  const CLOSING_KEY='NOT_USED_ONLINE';
  const ACTIVITY_KEY='NOT_USED_ONLINE';
  const DELETE_AUDIT_KEY='NOT_USED_ONLINE';
  let deleteAudit=[];
  const selectedActivityIds=new Set();
  let pendingDeleteIds=[];
  let currentPageRows=[];
  let closings=[];
  let page=0;
  let reviewTargetId='',reviewDecision='';
  function persistActivity(){return true;}
  function persistClosing(){return true;}
  const maskAccount=n=>String(n||'').length<=4?'••••':('•••• '+String(n).slice(-4));
  const showState={list:[],summary:null};
  function currentActor(){const identity=window.SIM_FIREBASE_BRIDGE?.identity();if(!identity)throw Error('Silakan login ke Firebase.');people.set(identity.uid,{fullName:identity.fullName,branch:identity.branch});return identity.uid;}

  function person(e){return people.get(e.uid)||{fullName:e.fullName||'Petugas Uji',branch:e.branch||'Cabang Uji'};}
  async function add(action,amount=0,reference='',opts={}){
    if(!ALLOWED.has(action)||!window.SIM_FIREBASE_BRIDGE?.identity())return;
    const nav=$('globalProductSelect')?.value;
    const p=opts.product||(action.startsWith('deposito_')?PRODUCTS[6][0]:NAV_PRODUCT[nav]||PRODUCTS[0][0]);
    try{await window.SIM_FIREBASE_BRIDGE.writeActivity({action,amount:Number(amount)||0,reference,product:p});}
    catch(err){console.warn('Pencatatan aktivitas ditolak',err);}
  }
  async function refreshServer(){
    const fb=window.SIM_FIREBASE_BRIDGE;
    if(!fb?.identity()?.isAdmin)return;
    $('monitorDashStatus').textContent='Mengambil aktivitas Firebase…';
    try{
      const data=await fb.loadAdmin();
      rows.splice(0,rows.length,...data.activities);
      closings.splice(0,closings.length,...data.closings);
      deleteAudit=data.audits;
      people.clear();
      for(const u of data.users)people.set(u.uid,{fullName:u.fullName||'Petugas',branch:u.branch||'Cabang'});
      for(const r of data.activities)if(!people.has(r.uid))people.set(r.uid,{fullName:r.fullName||'Petugas',branch:r.branch||'Cabang'});
      for(const c of data.closings)if(!people.has(c.uid))people.set(c.uid,{fullName:c.fullName||'Petugas',branch:c.branch||'Cabang'});
      selectedActivityIds.clear();page=0;render();
    }catch(err){$('monitorDashStatus').textContent='Gagal memuat Firebase: '+err.message;}
  }
  function summarize(list){
    const creditSaved=new Map(),latestFunding=new Map(),ao=new Map(),branch=new Map();
    for(const e of list){
      if(!ao.has(e.uid))ao.set(e.uid,{uid:e.uid,...person(e),lAccess:0,lCount:0,lAmount:0,
        dAccess:0,dSim:0,dLeads:0,dOffers:0,dPlaced:0,dAmount:0,dPlacedAmount:0});
      const a=ao.get(e.uid);
      if(e.action==='open_app')a.lAccess++;
      if(e.action==='deposito_open')a.dAccess++;
      if(e.action==='deposito_simulate')a.dSim++;
      if(e.action==='deposito_offer')a.dOffers++;
      if(e.action==='save_simulation'){
        const k=e.uid+'|'+e.reference+'|'+e.product;
        if(!creditSaved.has(k))creditSaved.set(k,e);
      }
      if(['deposito_lead_save','deposito_lead_placed','deposito_lead_lost','deposito_lead_delete'].includes(e.action)&&e.reference){
        const k=e.uid+'|'+e.reference;
        if(!latestFunding.has(k))latestFunding.set(k,e);
      }
    }
    for(const e of creditSaved.values()){const a=ao.get(e.uid);a.lCount++;a.lAmount+=e.principal;}
    for(const e of latestFunding.values()){
      if(['deposito_lead_delete','deposito_lead_lost'].includes(e.action))continue;
      const a=ao.get(e.uid);a.dLeads++;a.dAmount+=e.principal;
      if(e.action==='deposito_lead_placed'){a.dPlaced++;a.dPlacedAmount+=e.principal;}
    }
    for(const a of ao.values()){
      const k=a.branch;
      if(!branch.has(k))branch.set(k,{branch:k,users:new Set(),lAccess:0,lCount:0,lAmount:0,dAccess:0,dSim:0,dLeads:0,dOffers:0,dPlaced:0,dAmount:0,dPlacedAmount:0});
      const b=branch.get(k);b.users.add(a.uid);
      for(const key of ['lAccess','lCount','lAmount','dAccess','dSim','dLeads','dOffers','dPlaced','dAmount','dPlacedAmount'])b[key]+=a[key];
    }
    return {creditSaved:[...creditSaved.values()],latestFunding:[...latestFunding.values()],ao:[...ao.values()],branch:[...branch.values()]};
  }
  function matches(e){
    if(!categoryMatches(e))return false;
    const who=person(e),d=localDate(new Date(e.createdAt));
    const from=$('monitorFrom').value,to=$('monitorTo').value;
    if(from&&d<from)return false;if(to&&d>to)return false;
    if($('monitorBranch').value&&who.branch!==$('monitorBranch').value)return false;
    if($('monitorAO').value&&e.uid!==$('monitorAO').value)return false;
    if($('monitorProduct').value&&e.product!==$('monitorProduct').value)return false;
    if($('monitorAction').value&&e.action!==$('monitorAction').value)return false;
    const search=String($('monitorFilter').value||'').trim().toLocaleLowerCase('id');
    if(search&&![e.reference,who.fullName,who.branch,PRODUCT_NAME.get(e.product),ACTION_LABELS[e.action]]
      .some(x=>String(x||'').toLocaleLowerCase('id').includes(search)))return false;
    return true;
  }
  function options(id,items,label,keep=true){
    const el=$(id),old=keep?el.value:'';
    el.replaceChildren(new Option(label,''));
    for(const [value,title] of items)el.add(new Option(title,value));
    if(old&&items.some(x=>x[0]===old))el.value=old;
  }
  function updateDynamicFilters(){
    const subset=rows.filter(categoryMatches);
    options('monitorAO',[...new Set(subset.map(x=>x.uid))].map(id=>[id,`${person({uid:id}).fullName} · ${person({uid:id}).branch}`]),'Semua petugas');
    options('monitorBranch',[...new Set(subset.map(x=>person(x).branch))].sort().map(x=>[x,x]),'Semua cabang');
  }
  function applyCategoryUI(){
    for(const btn of document.querySelectorAll('#monitorAdmin .monitor-category-buttons button')){
      const selected=btn.dataset.category===activeCategory;
      btn.classList.toggle('is-active',selected);
      btn.setAttribute('aria-pressed',String(selected));
    }
    $('monitorCategoryExplanation').textContent=explanations[activeCategory];
    $('monitorProductChartSubtitle').textContent=String(productsForCategory().length)+' produk';
    $('monitorChartTitle').textContent=activeCategory==='all'?'Ringkasan Kinerja Terpadu':
      activeCategory==='lending'?'Analisis Aktivitas AO Lending':'Analisis Aktivitas AO Funding';
    $('monitorDonutTitle').textContent=activeCategory==='all'?'Komposisi Lending & Funding':
      activeCategory==='lending'?'Porsi Aktivitas Kredit':'Porsi Aktivitas Deposito';
    $('monitorActivityTableTitle').textContent='Riwayat Aktivitas '+categories[activeCategory];
    $('monitorLendingRecaps').hidden=activeCategory==='funding';
    $('monitorFundingPanel').hidden=activeCategory==='lending';
    const labels=activeCategory==='funding'
      ? ['AO Funding Aktif','Akses Deposito','Prospek Deposito Unik','Estimasi Dana Prospek']
      : ['Petugas Tercatat',activeCategory==='lending'?'Akses Kredit':'Akses Kredit + Deposito','Simulasi Kredit Unik','Plafon Simulasi Kredit'];
    for(const [id,label] of [['monitorMetricUser',labels[0]],['monitorMetricAccess',labels[1]],['monitorMetricSaved',labels[2]],['monitorMetricPrincipal',labels[3]]]){
      $(id).previousElementSibling.textContent=label;
    }
    options('monitorProduct',productsForCategory(),'Semua produk '+(activeCategory==='all'?'':'(kategori)'),true);
    options('monitorAction',actionsForCategory(),'Semua aktivitas',true);
  }
  function selectCategory(value){
    if(!Object.prototype.hasOwnProperty.call(categories,value))return;
    if(activeCategory===value)return;
    activeCategory=value;selectedActivityIds.clear();
    // Pertahankan periode laporan. Reset filter kategori lama yang dapat menyembunyikan aktivitas baru.
    for(const id of ['monitorAO','monitorBranch','monitorProduct','monitorAction','monitorFilter'])$(id).value='';
    page=0;
    applyCategoryUI();
    render();
  }
  const makeTd=(tr,val)=>{const td=document.createElement('td');td.textContent=String(val);tr.append(td);};
  function tableBody(id,data,map,colspan){
    const tbody=$(id);tbody.replaceChildren();
    for(const v of data){const tr=document.createElement('tr');for(const c of map(v))makeTd(tr,c);tbody.append(tr);}
    if(!data.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=colspan;td.textContent='Belum ada aktivitas sesuai filter.';tr.append(td);tbody.append(tr);}
  }
  function updateDeleteSelection(){
    const pageIds=currentPageRows.map(e=>e.id);
    const chosen=pageIds.filter(id=>selectedActivityIds.has(id)).length;
    const selectPage=$('monitorSelectPage');
    selectPage.checked=pageIds.length>0&&chosen===pageIds.length;
    selectPage.indeterminate=chosen>0&&chosen<pageIds.length;
    selectPage.disabled=pageIds.length===0;
    const validIds=new Set(rows.map(e=>e.id));
    for(const id of selectedActivityIds)if(!validIds.has(id))selectedActivityIds.delete(id);
    $('monitorSelectedCount').textContent=`${selectedActivityIds.size} aktivitas dipilih`;
    $('monitorDeleteSelected').disabled=selectedActivityIds.size===0;
  }
  function renderHistoryTable(view){
    const body=$('monitorHistory');body.replaceChildren();currentPageRows=view.slice();
    if(!view.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=13;td.textContent='Belum ada aktivitas sesuai filter.';tr.append(td);body.append(tr);updateDeleteSelection();return;}
    for(const e of view){
      const tr=document.createElement('tr');
      const checkboxTd=document.createElement('td');checkboxTd.className='monitor-select-column';
      const cb=document.createElement('input');cb.type='checkbox';cb.dataset.activityId=e.id;
      cb.checked=selectedActivityIds.has(e.id);cb.setAttribute('aria-label','Pilih aktivitas '+(ACTION_LABELS[e.action]||e.action)+' oleh '+person(e).fullName);
      checkboxTd.append(cb);tr.append(checkboxTd);
      for(const val of [fmtDate(e.createdAt),person(e).fullName,person(e).branch,ACTION_LABELS[e.action]||e.action,e.reference||'—','—',PRODUCT_NAME.get(e.product)||e.product,'—',money(e.principal),'—','—'])makeTd(tr,val);
      const action=document.createElement('td');action.className='monitor-action-column';
      const btn=document.createElement('button');btn.type='button';btn.className='monitor-delete-btn';btn.dataset.deleteId=e.id;
      btn.textContent='Hapus';btn.title='Hapus aktivitas ini secara permanen dari Firebase';
      action.append(btn);tr.append(action);body.append(tr);
    }
    updateDeleteSelection();
  }
  function renderDeleteAudit(){
    const body=$('monitorDeleteAuditBody');body.replaceChildren();
    if(!deleteAudit.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.textContent='Belum ada penghapusan.';tr.append(td);body.append(tr);return;}
    for(const log of deleteAudit){const tr=document.createElement('tr');for(const val of [fmtDate(log.at),log.deletedByName||'Administrator',log.count||1,log.reason])makeTd(tr,val);body.append(tr);}
  }
  function prepareDelete(ids){
    const current=new Set(rows.map(x=>x.id));
    pendingDeleteIds=[...new Set(ids)].filter(id=>current.has(id));
    if(!pendingDeleteIds.length)return;
    $('monitorDeleteDescription').textContent=`Anda akan menghapus ${pendingDeleteIds.length} aktivitas AO secara PERMANEN dari Firestore. Grafik, rekap dan ekspor akan diperbarui. Audit disimpan.`;
    $('monitorDeleteReason').value='';$('monitorDeleteError').textContent='';
    $('monitorDeleteDialog').showModal();
  }
  async function confirmDelete(e){
    e.preventDefault();const reason=$('monitorDeleteReason').value.trim();
    if(reason.length<5||reason.length>160){$('monitorDeleteError').textContent='Alasan wajib 5–160 karakter.';return;}
    if(!window.SIM_FIREBASE_BRIDGE?.identity()?.isAdmin){$('monitorDeleteError').textContent='Akses hanya untuk Administrator.';return;}
    const chosen=pendingDeleteIds.slice();
    $('monitorDeleteConfirm').disabled=true;
    try{
      await window.SIM_FIREBASE_BRIDGE.deleteActivities(chosen,reason);
      pendingDeleteIds=[];$('monitorDeleteDialog').close();await refreshServer();
    }catch(err){await refreshServer();$('monitorDeleteError').textContent='Sebagian data mungkin telah dihapus sebelum proses gagal. Periksa ulang: '+err.message;}
    finally{$('monitorDeleteConfirm').disabled=false;}
  }
  function renderCharts(list){
    const total=list.length,lending=list.filter(e=>!isFunding(e)).length,funding=total-lending;
    const pct=total?(lending/total*100):50;
    $('proChartCount').textContent=total.toLocaleString('id-ID')+' aktivitas terfilter';
    $('proDonut').style.setProperty('--lendPct',pct+'%');
    $('proDonut').setAttribute('aria-label',`Lending ${lending} aktivitas, Funding ${funding} aktivitas`);
    $('proDonutTotal').textContent=total.toLocaleString('id-ID');
    $('proDonutLending').textContent=lending.toLocaleString('id-ID');
    $('proDonutFunding').textContent=funding.toLocaleString('id-ID');
    if(!total)$('proDonut').style.background='#dae7f3';else $('proDonut').style.background='';
    const counts=new Map();for(const e of list)counts.set(localDate(new Date(e.createdAt)),(counts.get(localDate(new Date(e.createdAt)))||0)+1);
    const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-(6-i));return d;});
    const max=Math.max(1,...days.map(d=>counts.get(localDate(d))||0));
    const graph=$('proTrendChart');graph.replaceChildren();
    for(const d of days){
      const n=counts.get(localDate(d))||0,col=document.createElement('div');col.className='pro-trend-col';
      const v=document.createElement('div');v.className='pro-trend-value';v.textContent=String(n);
      const wrap=document.createElement('div');wrap.className='pro-bar-wrap';
      const bar=document.createElement('div');bar.className='pro-bar-3d';bar.style.setProperty('--bar-height',(n?Math.max(5,n/max*100):0)+'%');wrap.append(bar);
      const label=document.createElement('div');label.className='pro-trend-day';label.textContent=d.toLocaleDateString('id-ID',{weekday:'short'}).replace('.','');
      col.title=localDate(d)+' · '+n+' aktivitas';col.append(v,wrap,label);graph.append(col);
    }
    const productCounts=productsForCategory().map(([key,name])=>({name,count:list.filter(e=>e.product===key).length}));
    drawBars('proProductChart',productCounts,7);
    const actorCount=new Map();for(const e of list){const who=person(e);const key=e.uid;actorCount.set(key,{name:who.fullName, count:(actorCount.get(key)?.count||0)+1});}
    drawBars('proAoChart',[...actorCount.values()].sort((a,b)=>b.count-a.count).slice(0,6),6);
  }
  function drawBars(id,items,target){
    const root=$(id);root.replaceChildren();
    if(!items.some(x=>x.count)){const e=document.createElement('div');e.className='pro-empty';e.textContent='Belum ada aktivitas pada pilihan filter.';root.append(e);return;}
    const max=Math.max(1,...items.map(x=>x.count));
    for(const it of items.slice(0,target)){
      const row=document.createElement('div');row.className='pro-bar-row';row.title=it.name+' · '+it.count+' aktivitas';
      const label=document.createElement('span');label.className='pro-bar-label';label.textContent=it.name;
      const track=document.createElement('span');track.className='pro-bar-track';
      const fill=document.createElement('span');fill.className='pro-bar-fill';fill.style.display='block';fill.style.setProperty('--bar-width',it.count?Math.max(4,it.count/max*100)+'%':'0%');track.append(fill);
      const n=document.createElement('b');n.className='pro-bar-n';n.textContent=String(it.count);
      row.append(label,track,n);root.append(row);
    }
  }
  function closingMatch(c){
    if(activeCategory==='lending')return false;
    const from=$('monitorFrom').value,to=$('monitorTo').value;
    const d=localDate(new Date(c.createdAt));
    if(from&&d<from)return false;if(to&&d>to)return false;
    if($('monitorBranch').value&&c.branch!==$('monitorBranch').value)return false;
    if($('monitorAO').value&&c.uid!==$('monitorAO').value)return false;
    if($('monitorProduct').value&&$('monitorProduct').value!=='DEPOSITO ME')return false;
    const action=$('monitorAction').value;
    if(action && !['deposito_closing_submitted','deposito_closing_verified','deposito_closing_rejected'].includes(action))return false;
    if(action==='deposito_closing_submitted'&&!c.history?.some(h=>h.action==='submit'))return false;
    if(action==='deposito_closing_verified'&&c.status!=='verified')return false;
    if(action==='deposito_closing_rejected'&&c.status!=='rejected')return false;
    const q=String($('monitorFilter').value||'').trim().toLocaleLowerCase('id');
    return !q||[c.name,c.account,c.fullName,c.branch,c.id,c.verificationReference].some(x=>String(x||'').toLocaleLowerCase('id').includes(q));
  }
  function submitClosing(payload){
    const name=String(payload?.name||'').trim().slice(0,90),account=String(payload?.account||'').trim().toUpperCase().slice(0,30);
    const date=String(payload?.date||'').trim(),amount=Number(payload?.amount),tenor=Number(payload?.tenor),rate=Number(payload?.rate),notes=String(payload?.notes||'').trim().slice(0,300);
    const validDate=/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date))&&new Date(date+'T12:00:00').toISOString().slice(0,10)===date;
    if(name.length<2||!/^[A-Z0-9-]{4,30}$/.test(account)||!validDate||date>localDate(new Date())||date<'2000-01-01'||
      !Number.isFinite(amount)||amount<1000||amount>1e15||!Number.isInteger(tenor)||tenor<1||tenor>120||!Number.isFinite(rate)||rate<0||rate>100)
      return {ok:false,message:'Periksa kembali nama, nomor rekening, tanggal, nominal, tenor, dan bunga. Tanggal penempatan tidak boleh di masa depan.'};
    const uid=currentActor(),actor=people.get(uid);
    const old=closings.find(c=>c.account===account);
    if(old&&old.status!=='rejected')return {ok:false,message:'Nomor rekening tersebut sudah dilaporkan dengan status '+(old.status==='verified'?'Terverifikasi':'Menunggu Verifikasi')+'. Hindari NOA ganda.'};
    if(old&&old.uid!==uid)return {ok:false,message:'Hanya AO pelapor awal yang boleh memperbaiki laporan rekening ini.'};
    const now=new Date().toISOString();
    const c=old||{id:'CL-'+Date.now()+'-'+Math.random().toString(36).slice(2,6).toUpperCase(),account,createdAt:now,uid,fullName:actor.fullName,branch:actor.branch,history:[]};
    Object.assign(c,{name,account,date,amount,tenor,rate,notes,status:'pending',updatedAt:now,verifier:'',verifiedAt:'',verificationReference:'',reviewNote:''});
    c.history.push({action:old?'resubmit':'submit',at:now,by:actor.fullName});
    if(!old)closings.unshift(c);
    return window.SIM_FIREBASE_BRIDGE.createClosing({name,account,date,amount,tenor,rate,notes}).then(async result=>{await add('deposito_closing_submitted',amount,result.id,{product:'DEPOSITO ME'});await refreshServer();return {ok:true,message:'Laporan Closing '+result.id+' — MENUNGGU VERIFIKASI ADMIN.'};}).catch(err=>({ok:false,message:err.message}));
  }
  function sendClosingReply(source,result){
    try{source?.postMessage({channel:'SIM_DEPOSITO_CLOSING_RESULT',...result},'*');}catch(_){/* iframe dapat ditutup saat respons. */}
  }
  function openReview(id,decision){
    const c=closings.find(x=>x.id===id);
    if(!c||c.status!=='pending')return;
    reviewTargetId=id;reviewDecision=decision;
    $('closingReviewTitle').textContent=decision==='verify'?'Verifikasi Closing Deposito':'Minta Perbaikan Laporan';
    $('closingReviewContext').textContent=`${c.name} • ${maskAccount(c.account)} • ${money(c.amount)} • ${c.fullName} (${c.branch})`;
    $('closingReviewReference').value='';$('closingReviewNotes').value='';$('closingReviewError').textContent='';
    $('closingReviewReference').parentElement?.classList?.toggle('verification-not-required',decision==='reject');
    $('closingReviewReference').required=decision==='verify';
    $('closingReviewReference').disabled=decision==='reject';
    $('closingReviewConfirm').textContent=decision==='verify'?'Tandai Terverifikasi':'Kembalikan untuk Perbaikan';
    $('closingReviewDialog').showModal();
  }
  async function completeReview(){
    const c=closings.find(x=>x.id===reviewTargetId);
    if(!c||c.status!=='pending')return;
    const ref=$('closingReviewReference').value.trim(),note=$('closingReviewNotes').value.trim();
    if(reviewDecision==='verify'&&ref.length<5){$('closingReviewError').textContent='Referensi pemeriksaan minimal 5 karakter.';return;}
    if(reviewDecision==='reject'&&note.length<5){$('closingReviewError').textContent='Alasan perbaikan minimal 5 karakter.';return;}
    const btn=$('closingReviewConfirm');btn.disabled=true;
    try{
      await window.SIM_FIREBASE_BRIDGE.reviewClosing(c.id,reviewDecision,ref,note);
      await add(reviewDecision==='verify'?'deposito_closing_verified':'deposito_closing_rejected',c.amount,c.id,{product:'DEPOSITO ME'});
      $('closingReviewDialog').close();reviewTargetId='';reviewDecision='';await refreshServer();
    }catch(err){$('closingReviewError').textContent=err.message;}
    finally{btn.disabled=false;}
  }
  function renderClosing(list,s){
    const filtered=closings.filter(closingMatch).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    const verified=filtered.filter(c=>c.status==='verified');
    const pending=filtered.filter(c=>c.status==='pending');
    const rejected=filtered.filter(c=>c.status==='rejected');
    $('closingPending').textContent=String(pending.length);
    $('closingVerifiedNoa').textContent=String(new Set(verified.map(c=>c.account)).size);
    $('closingVerifiedAmount').textContent=money(verified.reduce((n,c)=>n+c.amount,0));
    $('closingRejected').textContent=String(rejected.length);
    const tbody=$('closingTableBody');tbody.replaceChildren();
    for(const c of filtered){
      const tr=document.createElement('tr');
      const statusNames={pending:'Menunggu Verifikasi',verified:'Terverifikasi (Admin)',rejected:'Perlu Perbaikan'};
      for(const val of [fmtDate(c.createdAt),c.fullName+' / '+c.branch,c.name,maskAccount(c.account),c.date,money(c.amount),c.tenor+' bln',c.rate+'%',statusNames[c.status],c.verificationReference||'—']){
        const td=document.createElement('td');td.textContent=String(val);tr.append(td);
        if(val===statusNames[c.status]){td.className='closing-status '+c.status;td.title=c.reviewNote||'';}
      }
      const actionTd=document.createElement('td');
      if(c.status==='pending')for(const [action,label] of [['verify','Verifikasi'],['reject','Perlu Perbaikan']]){
        const btn=document.createElement('button');btn.type='button';btn.textContent=label;btn.dataset.id=c.id;btn.dataset.review=action;btn.style.marginRight='5px';actionTd.append(btn);
      }
      else actionTd.textContent=c.verifier||'—';
      tr.append(actionTd);tbody.append(tr);
    }
    if(!filtered.length){const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=11;td.textContent='Belum ada laporan closing deposito sesuai filter.';tr.append(td);tbody.append(tr);}
    const byAo=new Map(),byBranch=new Map();
    for(const c of verified){
      const a=byAo.get(c.uid)||{noa:0,amount:0};a.noa++;a.amount+=c.amount;byAo.set(c.uid,a);
      const b=byBranch.get(c.branch)||{noa:0,amount:0};b.noa++;b.amount+=c.amount;byBranch.set(c.branch,b);
    }
    return {filtered,verified,pending,rejected,byAo,byBranch};
  }
  function render(){
    updateDynamicFilters();
    const list=rows.filter(matches).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    const s=summarize(list),funding=list.filter(isFunding);
    showState.list=list;showState.summary=s;
    showState.closing=renderClosing(list,s);
    $('monitorMetricUser').textContent=String(new Set(list.map(e=>e.uid)).size);
    $('monitorMetricAccess').textContent=String(list.filter(e=>activeCategory==='funding'?e.action==='deposito_open':
      activeCategory==='lending'?e.action==='open_app':['open_app','deposito_open'].includes(e.action)).length);
    $('monitorMetricSaved').textContent=String(activeCategory==='funding' ? s.ao.reduce((n,a)=>n+a.dLeads,0) : s.creditSaved.length);
    $('monitorMetricPrincipal').textContent=money(activeCategory==='funding' ? s.ao.reduce((n,a)=>n+a.dAmount,0) :
      s.creditSaved.reduce((n,e)=>n+e.principal,0));
    $('fundingMetricSim').textContent=String(funding.filter(e=>e.action==='deposito_simulate').length);
    $('fundingMetricLeads').textContent=String(s.ao.reduce((n,a)=>n+a.dLeads,0));
    $('fundingMetricOffer').textContent=String(funding.filter(e=>e.action==='deposito_offer').length);
    $('fundingMetricAmount').textContent=money(s.ao.reduce((n,a)=>n+a.dAmount,0));
    $('fundingMetricPlaced').textContent=String(s.ao.reduce((n,a)=>n+a.dPlaced,0));
    $('fundingMetricPlacedNominal').textContent=money(s.ao.reduce((n,a)=>n+a.dPlacedAmount,0));
    renderCharts(list);
    tableBody('monitorRecapAO',s.ao.filter(a=>a.lAccess||a.lCount),a=>[a.fullName,a.branch,a.lAccess,a.lCount,money(a.lAmount),'—'],6);
    tableBody('monitorRecapBranch',s.branch.filter(b=>b.lAccess||b.lCount),b=>[b.branch,b.users.size,b.lAccess,b.lCount,money(b.lAmount),'—'],6);
    const cStats=showState.closing;
    tableBody('fundingRecapAO',s.ao.filter(a=>a.dAccess||a.dSim||a.dLeads||a.dOffers||cStats.byAo.has(a.uid)),a=>[a.fullName,a.branch,a.dAccess,a.dSim,a.dLeads,a.dOffers,a.dPlaced,money(a.dAmount),cStats.byAo.get(a.uid)?.noa||0,money(cStats.byAo.get(a.uid)?.amount||0)],10);
    tableBody('fundingRecapBranch',s.branch.filter(b=>b.dAccess||b.dSim||b.dLeads||b.dOffers||cStats.byBranch.has(b.branch)),b=>[b.branch,b.users.size,b.dAccess,b.dSim,b.dLeads,b.dOffers,b.dPlaced,money(b.dAmount),cStats.byBranch.get(b.branch)?.noa||0,money(cStats.byBranch.get(b.branch)?.amount||0)],10);
    const pageSize=Number($('monitorPageSize').value)||50,maxPage=Math.max(0,Math.ceil(list.length/pageSize)-1);
    page=Math.min(page,maxPage);const start=page*pageSize,view=list.slice(start,start+pageSize);
    $('monitorPageInfo').textContent=list.length?`${start+1}–${start+view.length} dari ${list.length} aktivitas`:'0 aktivitas';
    $('monitorPrevPage').disabled=page===0;$('monitorNextPage').disabled=page===maxPage;
    renderHistoryTable(view);
    renderDeleteAudit();
    $('monitorDashStatus').textContent=`ONLINE · ${categories[activeCategory]} · ${list.length} aktivitas terbaru dimuat dari Firebase`;
    $('monitorExportExcel').disabled=false;$('monitorExportCSV').disabled=false;
  }
  function resetFilters(){
    for(const id of ['monitorBranch','monitorAO','monitorProduct','monitorAction','monitorFilter'])$(id).value='';
    // Biarkan rentang tanggal kosong agar contoh 7 hari dan aktivitas sebelumnya tetap terlihat.
    $('monitorFrom').value='';$('monitorTo').value='';page=0;selectedActivityIds.clear();render();
  }
  function toWorkbook(){
    const list=showState.list,s=showState.summary;
    const indicators=[['STATUS','FIREBASE ONLINE — DATA ADMIN'],
      ['Kategori aktivitas',categories[activeCategory]],['Aktivitas sesuai kategori',list.length],
      ['Petugas aktif unik',new Set(list.map(e=>e.uid)).size]];
    if(activeCategory!=='funding')indicators.push(
      ['Aktivitas Lending',list.filter(e=>!isFunding(e)).length],
      ['Simulasi Kredit unik',s.creditSaved.length],
      ['Total plafon simulasi kredit (Rp)',s.creditSaved.reduce((n,e)=>n+e.principal,0)]);
    if(activeCategory!=='lending')indicators.push(
      ['Aktivitas Funding',list.filter(isFunding).length],
      ['Simulasi deposito',list.filter(e=>e.action==='deposito_simulate').length],
      ['Prospek deposito aktif unik',s.ao.reduce((n,a)=>n+a.dLeads,0)],
      ['Nominal estimasi prospek (Rp)',s.ao.reduce((n,a)=>n+a.dAmount,0)],
      ['NOA deposito terverifikasi (uji)',showState.closing.verified.length],
      ['Nominal closing terverifikasi (uji, Rp)',showState.closing.verified.reduce((n,c)=>n+c.amount,0)],
      ['Laporan closing menunggu verifikasi',showState.closing.pending.length]);
    const tables=[
      {name:'Indikator',headers:['Indikator','Nilai'],rows:indicators,moneyCols:[]},
      {name:'AO Kredit',headers:['Nama AO','Cabang','Akses','Simulasi unik','Plafon simulasi (Rp)'],rows:s.ao.filter(a=>a.lAccess||a.lCount).map(a=>[a.fullName,a.branch,a.lAccess,a.lCount,a.lAmount]),moneyCols:[4]},
      {name:'AO Funding',headers:['Nama AO','Cabang','Akses Deposito','Simulasi','Prospek aktif','Buka WhatsApp','Status ditempatkan AO','Estimasi dana (Rp)','NOA terverifikasi (Admin)','Nominal terverifikasi (Rp)'],rows:s.ao.filter(a=>a.dAccess||a.dSim||a.dLeads||a.dOffers||showState.closing.byAo.has(a.uid)).map(a=>[a.fullName,a.branch,a.dAccess,a.dSim,a.dLeads,a.dOffers,a.dPlaced,a.dAmount,showState.closing.byAo.get(a.uid)?.noa||0,showState.closing.byAo.get(a.uid)?.amount||0]),moneyCols:[7,9]},
      {name:'Cabang Lending',headers:['Cabang','AO','Akses','Simulasi unik','Plafon (Rp)'],rows:s.branch.filter(a=>a.lAccess||a.lCount).map(a=>[a.branch,a.users.size,a.lAccess,a.lCount,a.lAmount]),moneyCols:[4]},
      {name:'Cabang Funding',headers:['Cabang','AO','Simulasi','Prospek aktif','Status ditempatkan','Estimasi dana (Rp)','NOA terverifikasi (Admin)','Nominal terverifikasi (Rp)'],rows:s.branch.filter(a=>a.dAccess||a.dSim||a.dLeads||a.dOffers||showState.closing.byBranch.has(a.branch)).map(a=>[a.branch,a.users.size,a.dSim,a.dLeads,a.dPlaced,a.dAmount,showState.closing.byBranch.get(a.branch)?.noa||0,showState.closing.byBranch.get(a.branch)?.amount||0]),moneyCols:[5,7]},
      {name:'Closing Deposito',headers:['ID Laporan','Tgl Input','Nama AO','Cabang','Nama Deposan','Rekening (disamarkan)','Tgl Penempatan','Nominal (Rp)','Tenor (bulan)','Bunga (%)','Status','Referensi Verifikasi','Admin Pemeriksa','Waktu Periksa','Catatan Admin'],
        rows:showState.closing.filtered.map(c=>[c.id,fmtDate(c.createdAt),c.fullName,c.branch,c.name,maskAccount(c.account),c.date,c.amount,c.tenor,c.rate,
          c.status==='verified'?'Terverifikasi (Admin)':c.status==='rejected'?'Perlu Perbaikan':'Menunggu Verifikasi',c.verificationReference||'',c.verifier||'',c.verifiedAt?fmtDate(c.verifiedAt):'',c.reviewNote||'']),moneyCols:[7]},
      {name:'Riwayat Gabungan',headers:['Waktu','AO','Cabang','Aktivitas','Produk','Referensi','Nominal indikatif (Rp)'],rows:list.map(e=>[fmtDate(e.createdAt),person(e).fullName,person(e).branch,ACTION_LABELS[e.action]||e.action,PRODUCT_NAME.get(e.product)||e.product,e.reference,e.principal]),moneyCols:[6]},
      {name:'Keterangan',headers:['Catatan','Penjelasan'],rows:[['Status','Data aktivitas Firebase online, bukan bukti realisasi bank.'],['Sumber','Aktivitas disimpan dalam Firestore.'],['Penempatan','Status ditempatkan merupakan input AO; NOA terverifikasi adalah persetujuan admin ONLINE, bukan bukti dana masuk ke bank.'],['Privasi','Periksa data pribadi dan kebijakan bank sebelum digunakan.']],moneyCols:[]}
    ];
    return tables.filter(t=>activeCategory==='all'||
      (activeCategory==='lending'? !['AO Funding','Cabang Funding'].includes(t.name) :
       !['AO Kredit','Cabang Lending'].includes(t.name)));
  }
  function exportData(type){
    const api=window.SIM_REPORT_EXPORT;
    if(!api){$('monitorDashStatus').textContent='Modul ekspor belum tersedia.';return;}
    const tables=toWorkbook(),filename='MONITORING_'+activeCategory.toUpperCase()+'_ONLINE_'+localDate(new Date());
    try{
      if(type==='excel')api.download(api.excelUnified(tables,{registeredUsers:new Set(showState.list.map(x=>x.uid)).size}),filename+'.xlsx');
      else api.download(api.csvArchive(tables),filename+'_CSV.zip');
      $('monitorDashStatus').textContent=`Ekspor ${type==='excel'?'Excel satu sheet':'CSV ZIP'} berhasil dibuat dari data Firebase.`;
    }catch(err){$('monitorDashStatus').textContent='Ekspor gagal: '+(err?.message||String(err));}
  }
  function init(){
    options('monitorAO',[],'Semua petugas',false);
    options('monitorBranch',[],'Semua cabang',false);
    applyCategoryUI();
    for(const button of document.querySelectorAll('#monitorAdmin .monitor-category-buttons button'))
      button.addEventListener('click',()=>selectCategory(button.dataset.category));
    $('monitorAdminButton').addEventListener('click',()=>{
      if(!window.SIM_FIREBASE_BRIDGE?.identity()?.isAdmin)return;
      $('monitorAdmin').hidden=false;document.body.classList.add('monitor-admin-open');refreshServer();
    });
    $('monitorCloseAdmin').addEventListener('click',()=>{$('monitorAdmin').hidden=true;document.body.classList.remove('monitor-admin-open');});
    $('monitorRefresh').addEventListener('click',refreshServer);
    $('monitorResetFilters').addEventListener('click',resetFilters);
    for(const id of ['monitorFrom','monitorTo','monitorBranch','monitorAO','monitorProduct','monitorAction','monitorFilter','monitorPageSize'])
      $(id).addEventListener(id==='monitorFilter'?'input':'change',()=>{page=0;selectedActivityIds.clear();render();});
    $('monitorSelectPage').addEventListener('change',e=>{
      for(const row of currentPageRows){if(e.target.checked)selectedActivityIds.add(row.id);else selectedActivityIds.delete(row.id);}
      renderHistoryTable(currentPageRows);
    });
    $('monitorHistory').addEventListener('change',e=>{
      const cb=e.target.closest('input[data-activity-id]');if(!cb)return;
      if(cb.checked)selectedActivityIds.add(cb.dataset.activityId);else selectedActivityIds.delete(cb.dataset.activityId);
      updateDeleteSelection();
    });
    $('monitorHistory').addEventListener('click',e=>{const btn=e.target.closest('button[data-delete-id]');if(btn&&window.SIM_FIREBASE_BRIDGE?.identity()?.isAdmin)prepareDelete([btn.dataset.deleteId]);});
    $('monitorDeleteSelected').addEventListener('click',()=>{if(window.SIM_FIREBASE_BRIDGE?.identity()?.isAdmin)prepareDelete([...selectedActivityIds]);});
    $('monitorDeleteCancel').addEventListener('click',()=>$('monitorDeleteDialog').close());
    $('monitorDeleteDialog').addEventListener('close',()=>{pendingDeleteIds=[];});
    $('monitorDeleteForm').addEventListener('submit',confirmDelete);
    $('monitorPrevPage').addEventListener('click',()=>{page=Math.max(0,page-1);render();});
    $('monitorNextPage').addEventListener('click',()=>{page++;render();});
    $('monitorExportExcel').addEventListener('click',()=>exportData('excel'));
    $('monitorExportCSV').addEventListener('click',()=>exportData('csv'));
    $('closingTableBody').addEventListener('click',event=>{
      if(!window.SIM_FIREBASE_BRIDGE?.identity()?.isAdmin)return;
      const btn=event.target.closest('button[data-review]');if(btn)openReview(btn.dataset.id,btn.dataset.review);
    });
    $('closingReviewCancel').addEventListener('click',()=>$('closingReviewDialog').close());
    $('closingReviewForm').addEventListener('submit',e=>{e.preventDefault();completeReview();});
    window.addEventListener('message',async event=>{
      const frame=$('depositoFrame'),nav=$('globalProductSelect');
      if(!frame||event.source!==frame.contentWindow||event.origin!==location.origin||
        event.data?.channel!=='SIM_DEPOSITO_CLOSING'||event.data.op!=='submit'||nav.value!=='deposito'||!window.SIM_FIREBASE_BRIDGE?.identity())return;
      try{sendClosingReply(event.source,await submitClosing(event.data.payload));}
      catch(err){sendClosingReply(event.source,{ok:false,message:err.message});}
    });
    window.addEventListener('sim-deposito-activity',e=>{if(ALLOWED.has(e.detail?.action))add(e.detail.action,e.detail.amount,e.detail.reference);});
    $('globalProductSelect').addEventListener('change',e=>{
      const product=NAV_PRODUCT[e.target.value];
      if(product&&e.target.value!=='deposito'&&e.isTrusted)add('open_app',0,'',{product});
    });
    window.addEventListener('sim-firebase-identity',event=>{
      if(!event.detail?.signedIn){rows.length=0;closings.length=0;people.clear();deleteAudit=[];
        $('monitorAdmin').hidden=true;document.body.classList.remove('monitor-admin-open');}
    });
    render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
