const $ = id => document.getElementById(id);
const money = n => n === null || !Number.isFinite(n) ? '—' : 'Rp ' + Math.round(n).toLocaleString('id-ID');
const pct = n => n.toLocaleString('id-ID', { maximumFractionDigits: 3 }) + '%';
const perMille = n => n === null ? '—' : n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ‰';
const dateText = s => new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const creditFields = ['principal', 'months', 'interest', 'salary', 'idir', 'provisionPercent', 'admin', 'payoff'];
let result, page = 0;
// Central print permission (applies to summary, all amortization pages, browser Print, and CSV).
// Printing is allowed only after the configured age policy and the actual instalment/THP pass.
let printAllowed = false;
let printReasons = [];
const EPS_IDIR = 1e-7;
function printEligibility(x, current, formValid) {
  if (!formValid || !current || !current.rows?.length) {
    return ['Lengkapi terlebih dahulu seluruh parameter simulasi yang wajib diisi.'];
  }
  const reasons = [];
  const p = current.policy;
  const maturity = current.rows.at(-1).date;
  if (p.ageLimit === null) {
    // Do not assume an unknown age policy passes. Update policy.js once approved.
    reasons.push('Batas usia Kredit Usaha belum ditetapkan pada konfigurasi aplikasi.');
  } else if (p.needsBirth || !p.deadline) {
    reasons.push('Tanggal lahir belum valid, sehingga batas usia kredit tidak dapat diperiksa.');
  } else if (maturity > p.deadline) {
    reasons.push(`Jatuh tempo ${dateText(maturity)} melebihi batas usia ${p.ageLimit} tahun (maksimal ${dateText(p.deadline)}).`);
  }
  const actualIdir = x.salary > 0 ? (current.payment / x.salary) * 100 : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(actualIdir)) {
    reasons.push('Gaji bersih / THP harus lebih besar dari Rp0 untuk menghitung IDIR.');
  } else {
    if (actualIdir > p.maxIdir + EPS_IDIR) {
      reasons.push(`IDIR aktual ${pct(actualIdir)} melampaui batas produk ${pct(p.maxIdir)}.`);
    }
    if (actualIdir > x.idir + EPS_IDIR) {
      reasons.push(`IDIR aktual ${pct(actualIdir)} melampaui batas yang diinput ${pct(x.idir)}.`);
    }
  }
  if (x.idir > p.maxIdir + EPS_IDIR) {
    reasons.push(`Batas IDIR yang diinput ${pct(x.idir)} melebihi ketentuan produk ${pct(p.maxIdir)}.`);
  }
  return reasons;
}
function updatePrintGate(x, current, valid) {
  printReasons = printEligibility(x, current, valid);
  printAllowed = printReasons.length === 0;
  for (const id of ['print', 'printScheduleTop', 'printSchedule', 'csv']) {
    $(id).disabled = !printAllowed;
    $(id).title = printAllowed ? (id === 'print' ? 'Cetak ringkasan satu halaman A4' : 'Cetak seluruh jadwal angsuran') : 'Cetak dinonaktifkan: ' + printReasons.join(' ');
  }
  const box = $('printGateNotice');
  box.classList.toggle('blocked', !printAllowed);
  $('printGateTitle').textContent = printAllowed ? 'MEMENUHI SYARAT CETAK' : 'CETAK DINONAKTIF — PERIKSA KETENTUAN';
  $('printGateReasons').replaceChildren();
  const messages = printAllowed ? ['Batas usia kredit dan IDIR telah memenuhi ketentuan yang dikonfigurasi.'] : printReasons;
  for (const m of messages) {
    const el = document.createElement('p'); el.textContent = m;
    $('printGateReasons').appendChild(el);
  }
  $('printBlockedReasons').replaceChildren();
  for (const m of printReasons) {
    const line = document.createElement('p'); line.textContent = '• ' + m;
    $('printBlockedReasons').appendChild(line);
  }
  return printAllowed;
}
function canPrintNow() {
  const x = read();
  const valid = $('form').checkValidity() && x.start >= '1900-01-01' && x.start <= '2200-12-31';
  return updatePrintGate(x, result, valid);
}

function read() {
  const x = Object.fromEntries(creditFields.map(id => [id, Number($(id).value)]));
  return { ...x, mode: $('mode').value, start: $('start').value, birth: $('birth').value, product: $('product').value, position: $('position').value };
}
function table(all = false) {
  const rows = all ? result.rows : result.rows.slice(page * 12, (page + 1) * 12);
  $('rows').innerHTML = rows.map(r => `<tr><td>${String(r.month).padStart(2, '0')}</td><td>${dateText(r.date)}</td><td>${money(r.payment)}</td><td>${money(r.principal)}</td><td>${money(r.interest)}</td><td>${money(r.balance)}</td></tr>`).join('');
  $('totals').innerHTML = `<tr><td colspan="2">Total seluruh tenor</td><td>${money(result.total)}</td><td>${money(read().principal)}</td><td>${money(result.totalInterest)}</td><td>Rp 0</td></tr>`;
  $('pageInfo').textContent = `Bulan ${page * 12 + 1}–${Math.min((page + 1) * 12, result.rows.length)} dari ${result.rows.length}`;
  $('prev').disabled = page === 0;
  $('next').disabled = (page + 1) * 12 >= result.rows.length;
}
function showCharges(x) {
  const i = result.insurance;
  $('provisionAmount').textContent = money(result.provision);
  $('insurance').textContent = money(i.premium);
  $('insuranceRate').textContent = perMille(i.rate);
  $('insuranceMessage').textContent = i.message;
  $('insuranceMessage').className = 'hint' + (i.available ? '' : ' unavailable');
  $('costProvision').textContent = money(result.provision);
  $('provisionLabel').textContent = `Provisi (${pct(x.provisionPercent)} × plafond)`;
  $('costAdmin').textContent = money(x.admin);
  $('costInsurance').textContent = money(i.premium);
  $('costPayoff').textContent = money(x.payoff);
  $('totalDeductions').textContent = money(result.deductions);
  $('costNet').textContent = money(result.net);
  $('insuranceDetail').textContent = i.available ? `Tarif ${perMille(i.rate)}: ${money(x.principal)} × ${i.rate.toLocaleString('id-ID')} ÷ 1.000 = ${money(i.premium)}. Usia asuransi ${i.age} tahun; tenor tarif ${i.years} tahun.` : i.message;
  $('insuranceDetail').className = 'hint' + (i.available ? '' : ' unavailable');
  $('netHint').textContent = i.available ? 'Setelah seluruh potongan' : 'Menunggu perhitungan premi AJK';
  $('facProduct').textContent = result.policy?.productName || ({asn:'KREDIT CPNS/ASN',pension:'KREDIT PENSIUN',business:'KREDIT USAHA'}[x.product]);
  $('facPrincipal').textContent = money(x.principal);
  $('facTenor').textContent = x.months + ' bulan';
  $('facStart').textContent = dateText(x.start);
  $('facBirth').textContent = x.birth ? dateText(x.birth) : 'Belum diisi';
  $('facSalary').textContent = money(x.salary);
  $('printDate').textContent = 'Dicetak ' + new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
}
function showPolicy(x, maturity) {
  const p = checkProductPolicy(x, maturity);
  $('positionField').hidden = x.product !== 'asn';
  $('policyRule').textContent = p.ageLimit === null ? 'Batas usia Kredit Usaha belum ditetapkan. Batas IDIR 95% dari THP.' : `Batas jatuh tempo: ulang tahun ke-${p.ageLimit}. Batas IDIR ${p.maxIdir}% dari THP.`;
  const details = [...p.messages];
  if (p.needsBirth) details.push('Isi tanggal lahir yang valid untuk memeriksa batas usia produk.');
  if (p.deadline) details.push('Tanggal batas usia: ' + dateText(p.deadline));
  $('policyNotice').replaceChildren(...details.map(text => { const line = document.createElement('p'); line.textContent = text; return line; }));
  $('policyNotice').hidden = details.length === 0;
  $('policyNotice').className = 'policy-notice' + (p.messages.length ? ' violation' : '');
  if (maturity) {
    $('productSummary').textContent = p.productName + (x.product === 'asn' ? ' · ' + (x.position === 'functional' ? 'Fungsional/Guru' : 'Struktural') : '');
    $('policySummary').textContent = [...p.messages, ...(p.needsBirth ? ['Batas usia belum diperiksa: tanggal lahir belum valid.'] : []), ...(p.deadline ? [`Batas usia ${p.ageLimit} tahun: ${dateText(p.deadline)}.`] : []), `Batas IDIR ${p.maxIdir}% dari THP.`].join(' ');
    $('policySummary').className = 'hint' + (p.messages.length || p.needsBirth ? ' unavailable' : '');
  }
  return p;
}
function update() {
  const x = read();
  showPolicy(x, null);
  const valid = $('form').checkValidity() && x.start >= '1900-01-01' && x.start <= '2200-12-31';
  $('error').textContent = valid ? '' : 'Lengkapi input dengan nilai yang valid. Tenor 1–600 bulan; tanggal awal antara tahun 1900 dan 2200.';
  $('results').hidden = !valid;
  // Validation for print/export is separate from simulation visibility.
  updatePrintGate(x, null, false);
  if (!valid) {
    result = null;
    ['provisionAmount', 'insurance', 'insuranceRate'].forEach(id => $(id).textContent = '—');
    $('insuranceMessage').textContent = 'Lengkapi parameter kredit untuk menghitung premi.';
    return;
  }
  result = calculate(x); page = 0;
  result.policy = showPolicy(x, result.rows.at(-1).date);
  $('years').textContent = `${(x.months / 12).toLocaleString('id-ID', { maximumFractionDigits: 1 })} tahun`;
  $('tenorRange').value = Math.min(x.months, 360);
  $('tenorTag').textContent = x.months + ' bulan';
  ['payment', 'totalInterest', 'total', 'net', 'maxPrincipal'].forEach(id => $(id).textContent = money(result[id]));
  $('eir').textContent = pct(result.rate * 1200);
  $('flat').textContent = pct(result.flat);
  $('flatLabel').textContent = x.mode === 'flat' ? 'Bunga flat / bulan' : 'Setara flat / bulan';
  // Angsuran terakhir sama dengan angsuran reguler, ditampilkan hanya pada tabel jadwal.
  const remainingSalary = x.salary - result.payment;
  const idirUsed = x.salary > 0 ? result.payment / x.salary * 100 : null;
  const remainingRate = x.salary > 0 ? remainingSalary / x.salary * 100 : null;
  // Warna menjadi alat bantu visual, BUKAN keputusan kelayakan kredit otomatis.
  // Ambang 10% dan 25% menunjukkan ruang sisa THP; kelayakan tetap mengikuti ketentuan produk.
  const exceedsIdir = idirUsed !== null && (idirUsed > x.idir + 1e-9 || idirUsed > result.policy.maxIdir + 1e-9);
  const remainingRisk = remainingRate === null || remainingSalary <= 0 || exceedsIdir || remainingRate < 10 ? 'critical'
    : remainingRate < 25 ? 'caution' : 'normal';
  const remainingMessages = {
    critical: 'PERLU EVALUASI • Ruang sisa gaji sangat terbatas',
    caution: 'PERLU PERHATIAN • Evaluasi biaya hidup dan kewajiban lain',
    normal: 'SISA THP LEBIH LONGGAR • Tetap verifikasi kebutuhan hidup'
  };
  $('remaining').textContent = money(remainingSalary);
  $('salaryDisplay').textContent = money(x.salary);
  $('salaryIdir').textContent = idirUsed === null ? '—' : idirUsed.toLocaleString('id-ID', {minimumFractionDigits:2,maximumFractionDigits:2}) + '%';
  $('salaryRisk').textContent = remainingMessages[remainingRisk];
  $('salaryHighlight').className = 'salary-highlight risk-' + remainingRisk;
  $('usedIdir').textContent = idirUsed === null ? '—' : idirUsed.toLocaleString('id-ID', {minimumFractionDigits:2,maximumFractionDigits:2}) + '%';
  $('idirFill').style.width = idirUsed === null ? '0%' : Math.max(0,Math.min(100,idirUsed))+'%';
  $('end').textContent = dateText(result.rows.at(-1).date);
  $('principalLabel').textContent = money(x.principal);
  $('interestLabel').textContent = money(result.totalInterest);
  const share = x.principal / result.total * 100;
  $('principalPercent').textContent = Math.round(share) + '%';
  $('donut').style.background = `conic-gradient(#2865b2 ${share}%,#dc5060 0)`;
  const warn = [];
  if (result.payment > x.salary * x.idir / 100) warn.push('Angsuran melebihi batas IDIR.');
  if (result.net !== null && result.net < 0) warn.push('Potongan melebihi plafond; dana bersih negatif.');
  warn.unshift(...result.policy.messages);
  $('status').textContent = warn.join(' ') || 'Perhitungan mengikuti batas IDIR yang diinput. Tetap periksa kemampuan bayar dan ketentuan kredit.';
  $('status').className = 'status' + (warn.length ? ' warn' : '');
  $('ageRow').hidden = !x.birth;
  if (x.birth) {
    const months = completedMonths(x.birth, result.rows.at(-1).date);
    $('age').textContent = months === null ? 'Tanggal lahir tidak valid' : `${Math.floor(months / 12)} th ${months % 12} bln`;
  }
  showCharges(x); table();
  updatePrintGate(x, result, valid);
}
function csvRows() {
  const x = read(), i = result.insurance;
  return [
    ['Simulasi kredit'], ['Design & Development © 2026 Luther Parinding, S.Si.'],
    ['Produk', result.policy.productName], ['Jabatan', x.product === 'asn' ? (x.position === 'functional' ? 'Fungsional/Guru' : 'Struktural') : 'Tidak berlaku'],
    ['Batas usia', result.policy.ageLimit ?? 'Belum ditetapkan'], ['Tanggal batas usia', result.policy.deadline ?? 'Belum tersedia'],
    ['IDIR (%)', x.idir], ['Batas IDIR (%)', result.policy.maxIdir], ['Notifikasi ketentuan', result.policy.messages.join(' | ') || (result.policy.needsBirth ? 'Tanggal lahir belum valid' : 'Tidak ada pelanggaran pada batas yang diperiksa')],
    ['Plafond', x.principal], ['Tenor (bulan)', x.months], ['Tanggal awal kredit', x.start], ['Tanggal lahir', x.birth],
    ['EIR per tahun (%)', result.rate * 1200], ['Provisi (%)', x.provisionPercent], ['Biaya provisi (Rp)', result.provision],
    ['Administrasi (Rp)', x.admin], ['Asuransi AJK', 'CHUBB'], ['Usia asuransi (tahun)', i.age ?? ''],
    ['Tenor tarif (tahun, dibulatkan naik)', i.years ?? ''], ['Rate premi (per mil)', i.rate ?? ''],
    ['Premi AJK (Rp)', i.premium ?? 'Belum dapat dihitung'], ['Status premi', i.message],
    ['Pelunasan kredit lama (Rp)', x.payoff], ['Total potongan (Rp)', result.deductions ?? 'Belum dapat dihitung'],
    ['Dana bersih (Rp)', result.net ?? 'Belum dapat dihitung'], [],
    ['Bulan', 'Tanggal', 'Angsuran', 'Pokok', 'Bunga', 'Baki debet'],
    ...result.rows.map(r => [r.month, r.date, r.payment, r.principal, r.interest, r.balance]),
    ['Total', '', result.total, x.principal, result.totalInterest, 0]
  ];
}
$('form').addEventListener('submit', e => e.preventDefault());
$('form').addEventListener('input', e => { if (e.target.id !== 'mode') update(); });
$('tenorRange').addEventListener('input', () => { $('months').value = $('tenorRange').value; update(); });
document.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { $('principal').value = b.dataset.p; update(); });
$('mode').addEventListener('change', () => {
  if (result) $('interest').value = ($('mode').value === 'eir' ? result.rate * 1200 : result.flat).toFixed(6);
  $('rateUnit').textContent = $('mode').value === 'flat' ? 'per bulan' : 'per tahun';
  $('interest').step = 'any'; update();
});
$('prev').onclick = () => { page--; table(); };
$('next').onclick = () => { page++; table(); };
$('reset').onclick = () => { $('form').reset(); $('rateUnit').textContent = 'per bulan'; update(); };
$('csv').onclick = () => {
  if (!canPrintNow()) return;
  const csv = csvRows().map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'simulasi-kredit.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
// Generate the COMPLETE amortization table for print, independently of on-screen pagination.
function prepareSchedulePrint() {
  if (!result || !result.rows?.length) return false;
  const x = read();
  const set = (id, value) => { $(id).textContent = value; };
  const date = d => dateText(d);
  const productName = result.policy?.productName || 'Simulasi kredit';
  const position = x.product === 'asn' ? (x.position === 'functional' ? ' · Fungsional/Guru' : ' · Struktural') : '';
  set('spProduct', productName + position);
  set('spPrincipal', money(x.principal));
  set('spTenor', `${x.months} bulan`);
  set('spPayment', money(result.payment));
  set('spStart', date(x.start));
  set('spEnd', date(result.rows.at(-1).date));
  set('spPrintDate', new Date().toLocaleDateString('id-ID', {day:'2-digit',month:'long',year:'numeric'}));
  set('spPeriod', `${result.rows.length} kali pembayaran`);
  const body = $('spRows');
  const tr = document.createDocumentFragment();
  // DOM APIs are used here: no user input is injected as HTML.
  for (const r of result.rows) {
    const line = document.createElement('tr');
    for (const value of [r.month, date(r.date), money(r.payment), money(r.principal), money(r.interest), money(r.balance)]) {
      const td = document.createElement('td');
      td.textContent = value;
      line.appendChild(td);
    }
    tr.appendChild(line);
  }
  body.replaceChildren(tr);
  set('spTotalPayment', money(result.total));
  set('spTotalPrincipal', money(x.principal));
  set('spTotalInterest', money(result.totalInterest));
  set('spFinalBalance', money(result.rows.at(-1).balance));
  return true;
}
const printScheduleHandler = () => {
  if (!canPrintNow() || !prepareSchedulePrint()) return;
  document.body.classList.remove('print-blocked');
  document.body.classList.add('printing-schedule');
  window.print();
};
$('printSchedule').onclick = printScheduleHandler;
$('printScheduleTop').onclick = printScheduleHandler;
$('print').onclick = () => {
  if (!canPrintNow()) return;
  document.body.classList.remove('printing-schedule', 'print-blocked');
  window.print();
};
// Browser Ctrl+P / menu Print can bypass disabled buttons; fail closed at print time.
// Browsers control their own print dialogs, so invalid cases show only a block sheet,
// never borrower details or the actual loan schedule.
window.addEventListener('beforeprint', () => {
  const ok = canPrintNow();
  document.body.classList.toggle('print-blocked', !ok);
  if (!ok) document.body.classList.remove('printing-schedule');
});
window.addEventListener('afterprint', () => {
  document.body.classList.remove('printing-schedule', 'print-blocked');
});
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p' && !canPrintNow()) {
    e.preventDefault();
    e.stopPropagation();
  }
}, true);
update();
