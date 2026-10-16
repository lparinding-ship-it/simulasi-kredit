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


/* Cetak KPEG Plus Metode 1/2: nomor angsuran berurutan dan 1 kelompok = 1 lembar A4.
   Hanya mengatur DOM pratinjau/cetak; tidak menghitung ulang nominal kredit. */
(function fixPegawaiPlusPrintPagination(){
  'use strict';
  const ROWS_PER_A4 = 24;
  function paginate(){
    if (!document.body.classList.contains('plus-document-preview')) return;
    const host=document.getElementById('plusPrintBody');
    if (!host) return;
    const oldPages=Array.from(host.querySelectorAll('.pd-schedule-page'));
    if (!oldPages.length) return;
    const container=oldPages[0].parentElement;
    if (!container || container.dataset.kpegA4Pagination === '24') return;
    const rows=oldPages.flatMap(page=>Array.from(page.querySelectorAll('tbody > tr')));
    if (!rows.length || !oldPages[0].querySelector('.pd-schedule-table tbody')) return;
    const count=Math.ceil(rows.length / ROWS_PER_A4);
    const newPages=[];
    for (let start=0; start<rows.length; start+=ROWS_PER_A4){
      const end=Math.min(start+ROWS_PER_A4,rows.length);
      const page=oldPages[0].cloneNode(true);
      const tbody=page.querySelector('.pd-schedule-table tbody');
      tbody.replaceChildren(...rows.slice(start,end).map(r=>r.cloneNode(true)));
      const subtitle=page.querySelector('.pd-head small');
      if(subtitle){
        const pageNo=Math.floor(start/ROWS_PER_A4)+1;
        subtitle.textContent=subtitle.textContent.replace(/Halaman\s+\d+\s*\/\s*\d+/i,`Halaman ${pageNo}/${count}`);
      }
      const section=page.querySelector('.pd-section-title');
      if(section)section.textContent=`RINCIAN BULAN ${start+1}—${end} / ${rows.length}`;
      // Identitas lengkap (debitur, cabang, AO, plafon, angsuran) cukup pada lembar pertama.
      // Lembar berikutnya tetap mencantumkan judul, nomor referensi, nomor halaman dan tabel.
      if (start > 0) {
        page.querySelector('.pd-grid')?.remove();
        page.classList.add('pd-schedule-continuation');
      }
      newPages.push(page);
    }
    container.replaceChildren(...newPages);
    container.dataset.kpegA4Pagination = '24';
  }
  function init(){
    const host=document.getElementById('plusPrintBody');
    if (!host) return;
    const observer=new MutationObserver(paginate);
    observer.observe(host,{childList:true});
    window.addEventListener('beforeprint',paginate);
    paginate();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
