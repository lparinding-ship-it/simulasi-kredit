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
