(function(root){
'use strict';
function pmt(p,r,n){return r===0?p/n:p*r/(-Math.expm1(-n*Math.log1p(r)))}
function edate(s,n){const [y,m,d]=s.split('-').map(Number),a=new Date(Date.UTC(y,m-1+n,1));a.setUTCDate(Math.min(d,new Date(Date.UTC(a.getUTCFullYear(),a.getUTCMonth()+1,0)).getUTCDate()));return a.toISOString().slice(0,10)}
function calculate(x){
for(const k of ['price','dp','annual','months'])if(!Number.isFinite(x[k]))throw Error('Lengkapi parameter angka.');
if(!Number.isSafeInteger(x.price)||x.price>1e12)throw Error('Harga harus rupiah bulat dan maksimal Rp1 triliun.');
if(x.price<=0||x.dp<0||x.dp>=100||x.annual<0||x.annual>100||!Number.isInteger(x.months)||x.months<1||x.months>240)throw Error('Harga harus positif; DP 0–<100%; bunga 0–100%; tenor 1–240 bulan.');
if(!/^\d{4}-\d{2}-\d{2}$/.test(x.start)||!Number.isFinite(Date.parse(x.start))||new Date(x.start).toISOString().slice(0,10)!==x.start)throw Error('Tanggal realisasi tidak valid.');
if(!['flat','annuity'].includes(x.mode))throw Error('Metode bunga tidak valid.');
let cash=0,financed=0;for(const c of x.costs){if(!Number.isSafeInteger(c.amount)||c.amount>1e12||c.amount<0||!['cash','finance'].includes(c.pay))throw Error('Biaya harus nol atau positif.');if(c.pay==='finance')financed+=c.amount;else cash+=c.amount;}
const down=Math.round(x.price*x.dp/100),principal=Math.round(x.price-down+financed),n=x.months,r=x.mode==='flat'?x.annual/100:x.annual/1200;
if(principal<=0)throw Error('Pokok kredit setelah pembulatan harus lebih dari nol.');
const base=x.mode==='flat'?principal/n+principal*r:pmt(principal,r,n);
const payment=Math.max(100,Math.round(base/100)*100,Math.ceil(principal/n/100)*100);
let lo=0,hi=1;while(pmt(principal,hi,n)<payment)hi*=2;for(let i=0;i<110;i++){const mid=(lo+hi)/2;if(pmt(principal,mid,n)>payment)hi=mid;else lo=mid;}const rate=(lo+hi)/2;
let balance=principal;const rows=[];for(let i=1;i<=n;i++){const left=n-i,target=left?Math.round(payment*(-Math.expm1(-left*Math.log1p(rate)))/rate):0;const end=x.mode==='flat'?Math.max(0,principal-Math.round(principal*i/n)):Math.max(0,balance-payment,Math.min(balance,target));const pokok=balance-end;rows.push({month:i,date:edate(x.start,i),opening:balance,principal:pokok,interest:payment-pokok,payment,balance:end});balance=end;}
return {inputMonthly:r,roundingAdjustment:(payment-base)*n,down,principal,cash,financed,base,payment,rate,rows,total:payment*n,interest:payment*n-principal,initial:down+cash,outlay:down+cash+payment*n};}
const api={calculate,edate};if(typeof module!=='undefined')module.exports=api;else root.VehicleCalc=api;
})(globalThis);