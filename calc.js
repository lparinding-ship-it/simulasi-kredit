function pmt(p,r,n){return r===0?p/n:p*r/(-Math.expm1(-n*Math.log1p(r)))}
function rate(p,a,n){if(a<=p/n)return 0;let lo=0,hi=1;while(pmt(p,hi,n)<a)hi*=2;for(let i=0;i<100;i++){let m=(lo+hi)/2;if(pmt(p,m,n)>a)hi=m;else lo=m}return(lo+hi)/2}
function nextMonth(s){let [y,m,d]=s.split('-').map(Number);let last=new Date(Date.UTC(y,m+1,0)).getUTCDate();return `${m===12?y+1:y}-${String(m===12?1:m+1).padStart(2,'0')}-${String(Math.min(d,last)).padStart(2,'0')}`}
const chargeCalculator=typeof module!=='undefined'?require('./insurance.js').calculateCharges:calculateCharges;
function calculate(x){
 const {principal:p,months:n,interest,mode,start}=x;
 const enteredRate=mode==='flat'?0:interest/1200;
 const theoretical=mode==='flat'?p/n+p*interest/100:pmt(p,enteredRate,n);
 // Payment remains constant (including month n). The rounding does not change the instalment shown.
 // Guarantee it also covers at least the straight-line monthly principal for small test cases.
 const payment=Math.max(100,Math.round(theoretical/100)*100,Math.ceil(p/n/100)*100);
 // Annuity-equivalent periodic rate re-solved from the actually payable fixed amount.
 // This prevents the last payment from becoming different due to Rp100 rounding.
 const r=rate(p,payment,n);
 let balance=p,rows=[],date=start;
 for(let i=1;i<=n;i++){
  date=nextMonth(date);
  const remaining=n-i;
  // Compute each period's outstanding balance from the PV of the remaining fixed payments.
  // Rounding only the balance at each boundary avoids accumulated Rp1 drifts and works
  // even with tiny instalments / long tenors / high interest rates.
  const outstanding=remaining===0?0:(r===0?payment*remaining:payment*(-Math.expm1(-remaining*Math.log1p(r)))/r);
  const target=remaining===0?0:Math.round(outstanding);
  const newBalance=Math.max(0,balance-payment,Math.min(balance,target));
  const principalDue=balance-newBalance;
  const interestDue=payment-principalDue;
  balance=newBalance;
  rows.push({month:i,date,payment,principal:principalDue,interest:interestDue,balance});
 }
 const totalInterest=rows.reduce((s,row)=>s+row.interest,0);
 return {rows,payment,rate:r,totalInterest,total:payment*n,...chargeCalculator(x),flat:((payment-p/n)/p)*100,maxPrincipal:Math.floor((x.salary*x.idir/100)/(1/n+(mode==='flat'?interest/100:(pmt(1,enteredRate,n)-1/n)))/10000)*10000};
}
if(typeof module!=='undefined')module.exports={calculate,pmt,rate,nextMonth};
