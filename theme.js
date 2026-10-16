/* Shared theme for Kredit, Pegawai Plus, DEPOSITO ME and Dashboard Admin. */
(function () {
  'use strict';
  const KEY='simkredit_user_theme_v1';
  const CHANNEL='SIMKREDIT_THEME_V1';
  const html=document.documentElement;
  let theme=(html.getAttribute('data-app-theme')==='dark')?'dark':'light';
  function save(v){try {localStorage.setItem(KEY,v)}catch(_){}}
  function allowMessage(event){
    const origin=location.protocol==='file:'?'null':location.origin;
    if(event.origin!==origin)return false;
    if(window.parent!==window)return event.source===window.parent;
    return [...document.querySelectorAll('iframe')].some(f=>f.contentWindow===event.source);
  }
  function updateButton(){
    document.querySelectorAll('.app-theme-switch').forEach(button=>{
      const dark=theme==='dark';
      button.setAttribute('aria-label',dark?'Ubah ke tema terang':'Ubah ke tema gelap');
      button.setAttribute('title',dark?'Aktifkan Light Mode':'Aktifkan Dark Mode');
      button.setAttribute('aria-pressed',String(dark));
      const icon=button.querySelector('.app-theme-icon'),text=button.querySelector('.app-theme-text');
      if(icon)icon.textContent=dark?'☀':'☾';
      if(text)text.textContent=dark?'Terang':'Gelap';
    });
  }
  function sendToFrames(){
    const origin=location.protocol==='file:'?'*':location.origin;
    document.querySelectorAll('iframe').forEach(f=>{try {f.contentWindow?.postMessage({channel:CHANNEL,theme},origin)}catch(_){}});
  }
  function apply(value, options={}){
    if(!['light','dark'].includes(value))return;
    theme=value;html.setAttribute('data-app-theme',value);
    if(!options.fromStorage) save(value);
    const meta=document.querySelector('meta[name="theme-color"]');
    if(meta)meta.setAttribute('content',value==='dark'?'#101d30':'#173f78');
    updateButton();sendToFrames();
    // Also tell parent frame so standalone Deposito/Plus toggle is reflected in Credit.
    if(window.parent!==window && !options.fromParent){
      const target=location.protocol==='file:'?'*':location.origin;
      try{window.parent.postMessage({channel:CHANNEL,theme:value},target)}catch(_){ }
    }
  }
  function button(){
    const b=document.createElement('button');b.type='button';b.className='app-theme-switch';
    b.innerHTML='<span class="app-theme-icon" aria-hidden="true">☾</span><span class="app-theme-text">Gelap</span>';
    b.addEventListener('click',()=>apply(theme==='dark'?'light':'dark'));
    return b;
  }
  function init(){
    // On direct pages there is a visible switch; inside embedded Pegawai Plus the parent owns the switch.
    const isIndex=!!document.getElementById('monitorAccess');
    const isDeposit=!!document.querySelector('.depo-brand-text');
    const isPlus=!!document.querySelector('.topbar-inner');
    if(isIndex){
      const credit=document.querySelector('body>header');
      if(credit)credit.appendChild(button());
      const admin=document.querySelector('#monitorAdmin .monitor-admin-actions');
      if(admin)admin.appendChild(button());
      const login=document.querySelector('#monitorAccess .monitor-login-card');
      if(login){login.style.position='relative';login.appendChild(button())}
    }else if(isDeposit){
      (document.querySelector('header .header-right')||document.querySelector('header'))?.appendChild(button());
    }else if(isPlus && window.parent===window){
      (document.querySelector('.topbar-inner .top-actions')||document.querySelector('.topbar-inner'))?.appendChild(button());
    }
    updateButton();
    document.querySelectorAll('iframe').forEach(f=>f.addEventListener('load',sendToFrames));
    sendToFrames();
  }
  window.addEventListener('storage',e=>{if(e.key===KEY && ['light','dark'].includes(e.newValue))apply(e.newValue,{fromStorage:true})});
  window.addEventListener('message',e=>{if(e.data?.channel!==CHANNEL || !allowMessage(e))return;
    const fromParent=window.parent!==window;
    if(e.data.theme!==theme)apply(e.data.theme,{fromParent});
  });
  window.AppTheme={set:apply,get:()=>theme};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();


/* KPEG Plus Metode 1/2 — jadwal cetak A4 hemat kertas.
   30 angsuran pada halaman pertama (dengan identitas), kemudian maksimal 35
   per halaman lanjutan (tanpa identitas). Bagi sisa baris merata untuk
   menghindari lembar terakhir yang terlalu kosong.
   Semua baris adalah hasil render kalkulasi asli; tidak dihitung ulang. */
(function fixPegawaiPlusPrintPagination(){
  'use strict';
  const VERSION = 'kpeg-a4-balanced-phase-elegant-v38';
  const FIRST_LIMIT = 30;
  const FOLLOW_LIMIT = 35;
  function compactPrintStyle(){
    if (document.getElementById('kpeg-print-hemat-kertas-css')) return;
    const style=document.createElement('style');
    style.id='kpeg-print-hemat-kertas-css';
    // Tabel tetap netral. Hanya label fase dan SATU baris transisi yang diberi aksen.
    // Scope sempit untuk jadwal KPEG+, tidak mengubah tabel/produk lain.
    style.textContent=`
      body.plus-document-preview #plusDocument #plusPrintBody .pd-schedule-table tbody tr td {
        background:#ffffff!important;color:#1d3c5e!important;box-shadow:none!important;
      }
      body.plus-document-preview #plusDocument #plusPrintBody .pd-schedule-table tbody tr:nth-child(even) td {
        background:#f6f8fb!important;
      }
      body.plus-document-preview #plusDocument #plusPrintBody .pd-schedule-table tbody tr.kpeg-phase-transition td {
        background:#e9f4f3!important;
      }
      body.plus-document-preview #plusDocument #plusPrintBody .pd-schedule-table .kpeg-phase-tag {
        display:inline-block;box-sizing:border-box;
        min-width:50px;padding:2px 6px;border-radius:5px;
        font-size:8.1px;line-height:1.15;font-weight:700;
        text-align:center;letter-spacing:0;white-space:nowrap;
        print-color-adjust:exact;-webkit-print-color-adjust:exact;
      }
      body.plus-document-preview #plusDocument #plusPrintBody .pd-schedule-table .kpeg-phase-tag-active {
        background:#e7f0fc!important;color:#1e568c!important;
      }
      body.plus-document-preview #plusDocument #plusPrintBody .pd-schedule-table .kpeg-phase-tag-pension {
        background:#e6f4ee!important;color:#17684b!important;
      }
      body.plus-document-preview #plusDocument .kpeg-amount-active {color:#255887!important;font-weight:700;}
      body.plus-document-preview #plusDocument .kpeg-amount-pension {color:#276a52!important;font-weight:700;}
      @media print {
        body.plus-document-preview #plusDocument .pd-schedule-table tbody td {
          padding:1.2mm 5px!important;
        }
        body.plus-document-preview #plusDocument .pd-schedule-page {
          break-inside:avoid!important;page-break-inside:avoid!important;
        }
      }
    `;
    document.head.appendChild(style);
  }
  function paginate(){
    if (!document.body.classList.contains('plus-document-preview'))return;
    const host=document.getElementById('plusPrintBody');
    if (!host)return;
    const oldPages=Array.from(host.querySelectorAll('article.pd-schedule-page'));
    if (!oldPages.length || oldPages.every(p=>p.dataset.kpegPaginationVersion===VERSION))return;
    const container=oldPages[0].parentElement;
    if (!container || !oldPages[0].querySelector('.pd-schedule-table tbody'))return;
    const allRows=oldPages.flatMap(p=>Array.from(p.querySelectorAll('.pd-schedule-table tbody > tr')));
    const total=allRows.length;
    if (!total)return;
    // Jumlah halaman ditentukan lebih dulu, lalu isinya diratakan tanpa sisa pendek.
    const firstCount=Math.min(FIRST_LIMIT,total);
    const remaining=total-firstCount;
    const followPages=Math.ceil(remaining/FOLLOW_LIMIT);
    const perFollow=followPages ? Math.floor(remaining/followPages) : 0;
    const extra=followPages ? remaining%followPages : 0;
    const sizes=[firstCount];
    for(let i=0;i<followPages;i++)sizes.push(perFollow+(i<extra?1:0));
    // Gunakan label ringkas seperti tabel utama (PEGAWAI / PENSIUN).
    // Seluruh nominal pada kolom lain tetap diambil apa adanya dari hasil kalkulasi.
    const firstPensionIndex=allRows.findIndex((r,idx)=>{
      const phase=(r.cells[2]?.textContent||'').trim().toLowerCase();
      const previous=(allRows[idx-1]?.cells[2]?.textContent||'').trim().toLowerCase();
      return phase==='pensiun' && (previous==='aktif'||previous==='pegawai');
    });
    function applyPhaseMarkers(page, globalOffset) {
      const rows=Array.from(page.querySelectorAll('.pd-schedule-table tbody tr'));
      for (let rowIndex=0;rowIndex<rows.length;rowIndex++) {
        const row=rows[rowIndex];
        const cell=row.cells[2];
        if(!cell)continue;
        const label=(cell.textContent||'').trim().toLowerCase();
        const isActive=label==='aktif'||label==='pegawai';
        const isPension=label==='pensiun';
        if (!isActive&&!isPension)continue;
        row.classList.remove('kpeg-phase-active','kpeg-phase-pension');
        row.classList.toggle('kpeg-phase-transition',globalOffset+rowIndex===firstPensionIndex);
        // Tidak menyentuh isi kolom nominal/angsuran/pokok/bunga/baki debet.
        const tag=document.createElement('span');
        tag.className='kpeg-phase-tag '+(isActive?'kpeg-phase-tag-active':'kpeg-phase-tag-pension');
        tag.textContent=isActive?'PEGAWAI':'PENSIUN';
        cell.replaceChildren(tag);
      }
      // Nominal aktif/pensiun pada identitas halaman pertama, diberi warna tanpa menambah baris.
      const datum = Array.from(page.querySelectorAll('.pd-datum')).find(d =>
        /angsuran\s+aktif\s*\/\s*pensiun/i.test(d.querySelector('span')?.textContent || ''));
      const value = datum?.querySelector('strong');
      if (value && !value.querySelector('.kpeg-amount-active')) {
        const parts = value.textContent.trim().split(/\s+\/\s+/);
        if (parts.length === 2) {
          const active = document.createElement('span');active.className='kpeg-amount-active';active.textContent=parts[0];
          const pension = document.createElement('span');pension.className='kpeg-amount-pension';pension.textContent=parts[1];
          value.replaceChildren(active, document.createTextNode(' / '), pension);
        }
      }
    }
    const template=oldPages[0];
    const pages=[];
    let offset=0;
    for(let pi=0;pi<sizes.length;pi++){
      const size=sizes[pi];
      const page=template.cloneNode(true);
      page.dataset.kpegPaginationVersion=VERSION;
      const tbody=page.querySelector('.pd-schedule-table tbody');
      tbody.replaceChildren(...allRows.slice(offset,offset+size).map(tr=>tr.cloneNode(true)));
      const subtitle=page.querySelector('.pd-head small');
      if(subtitle)subtitle.textContent=subtitle.textContent.replace(/Halaman\s+\d+\s*\/\s*\d+/i,`Halaman ${pi+1}/${sizes.length}`);
      const section=page.querySelector('.pd-section-title');
      if(section)section.textContent=`RINCIAN BULAN ${offset+1}—${offset+size} / ${total}`;
      if(pi>0){
        page.querySelector('.pd-grid')?.remove();
        page.classList.add('pd-schedule-continuation');
      }
      applyPhaseMarkers(page, offset);
      pages.push(page);
      offset+=size;
    }
    container.replaceChildren(...pages);
  }
  function init(){
    compactPrintStyle();
    const host=document.getElementById('plusPrintBody');
    if(!host)return;
    const observer=new MutationObserver(paginate);
    observer.observe(host,{childList:true,subtree:false});
    window.addEventListener('beforeprint',paginate);
    paginate();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
