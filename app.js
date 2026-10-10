const $ = id => document.getElementById(id);
const money = n => n === null || !Number.isFinite(n) ? '—' : 'Rp ' + Math.round(n).toLocaleString('id-ID');
const pct = n => n.toLocaleString('id-ID', { maximumFractionDigits: 3 }) + '%';
const perMille = n => n === null ? '—' : n.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ‰';
const dateText = s => new Date(s + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const creditFields = ['principal', 'months', 'interest', 'salary', 'idir', 'provisionPercent', 'admin', 'payoff'];
let result, page = 0;
function read() {
  const x = Object.fromEntries(creditFields.map(id => [id, Number($(id).value)]));
  return { ...x, mode: $('mode').value, start: $('start').value, birth: $('birth').value };
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
  $('printParameters').textContent = `Plafond ${money(x.principal)} · Tenor ${x.months} bulan · Awal kredit ${dateText(x.start)} · Tanggal lahir ${x.birth ? dateText(x.birth) : 'belum diisi'}`;
}
function update() {
  const x = read();
  const valid = $('form').checkValidity() && x.start >= '1900-01-01' && x.start <= '2200-12-31';
  $('error').textContent = valid ? '' : 'Lengkapi input dengan nilai yang valid. Tenor 1–600 bulan; tanggal awal antara tahun 1900 dan 2200.';
  $('results').hidden = !valid;
  $('csv').disabled = $('print').disabled = !valid;
  if (!valid) {
    result = null;
    ['provisionAmount', 'insurance', 'insuranceRate'].forEach(id => $(id).textContent = '—');
    $('insuranceMessage').textContent = 'Lengkapi parameter kredit untuk menghitung premi.';
    return;
  }
  result = calculate(x); page = 0;
  $('years').textContent = `${(x.months / 12).toLocaleString('id-ID', { maximumFractionDigits: 1 })} tahun`;
  $('tenorRange').value = Math.min(x.months, 360);
  $('tenorTag').textContent = x.months + ' bulan';
  ['payment', 'totalInterest', 'total', 'net', 'maxPrincipal'].forEach(id => $(id).textContent = money(result[id]));
  $('eir').textContent = pct(result.rate * 1200);
  $('flat').textContent = pct(result.flat);
  $('last').textContent = money(result.rows.at(-1).payment);
  $('remaining').textContent = money(x.salary - result.payment);
  $('end').textContent = dateText(result.rows.at(-1).date);
  $('principalLabel').textContent = money(x.principal);
  $('interestLabel').textContent = money(result.totalInterest);
  const share = x.principal / result.total * 100;
  $('principalPercent').textContent = Math.round(share) + '%';
  $('donut').style.background = `conic-gradient(#17796e ${share}%,#a9d7c7 0)`;
  const warn = [];
  if (result.payment > x.salary * x.idir / 100) warn.push('Angsuran melebihi batas IDIR.');
  if (result.net !== null && result.net < 0) warn.push('Potongan melebihi plafond; dana bersih negatif.');
  $('status').textContent = warn.join(' ') || 'Angsuran berada dalam batas IDIR yang Anda isi.';
  $('status').className = 'status' + (warn.length ? ' warn' : '');
  $('ageRow').hidden = !x.birth;
  if (x.birth) {
    const months = completedMonths(x.birth, result.rows.at(-1).date);
    $('age').textContent = months === null ? 'Tanggal lahir tidak valid' : `${Math.floor(months / 12)} th ${months % 12} bln`;
  }
  showCharges(x); table();
}
function csvRows() {
  const x = read(), i = result.insurance;
  return [
    ['Simulasi kredit'], ['Template untuk kalangan internal, Di Buat Oleh Luther Parinding, S.Si'],
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
  if (!result) return;
  const csv = csvRows().map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = 'simulasi-kredit.csv'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener('beforeprint', () => { if (result) table(true); });
window.addEventListener('afterprint', () => { if (result) table(); });
$('print').onclick = () => window.print();
update();
