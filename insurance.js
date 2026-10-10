const insuranceTable = typeof module !== 'undefined' ? require('./chubb-rates.js') : CHUBB_TABLE;
function parseDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : null;
}
function completedMonths(birth, start) {
  const b = parseDate(birth), s = parseDate(start);
  if (!b || !s || b > s) return null;
  return (s.getUTCFullYear() - b.getUTCFullYear()) * 12 + s.getUTCMonth() - b.getUTCMonth() - (s.getUTCDate() < b.getUTCDate() ? 1 : 0);
}
function calculateInsurance({ principal, months, birth, start }) {
  const unavailable = (message, extra = {}) => ({ available: false, premium: null, rate: null, age: null, years: null, message, ...extra });
  if (!birth) return unavailable('Isi tanggal lahir untuk menghitung premi AJK CHUBB.');
  const ageMonths = completedMonths(birth, start);
  if (ageMonths === null) return unavailable('Tanggal lahir harus valid dan tidak melewati tanggal awal kredit.');
  const age = Math.floor(ageMonths / 12) + (ageMonths % 12 >= 6 ? 1 : 0);
  const years = Math.ceil(months / 12), extra = { age, years };
  if (!Number.isInteger(months) || months < 1 || years > 20) return unavailable('Tarif CHUBB tersedia untuk tenor 1–240 bulan (1–20 tahun tarif).', extra);
  const row = insuranceTable.rates[age];
  if (!row) return unavailable(`Usia asuransi ${age} tahun di luar tabel CHUBB (18–74 tahun).`, extra);
  const rate = row[years - 1];
  if (!Number.isFinite(rate) || rate <= 0) return unavailable(`Tarif untuk usia ${age} tahun dan tenor ${years} tahun bernilai nol atau tidak tersedia di tabel. Konfirmasikan premi AJK.`, extra);
  if (!Number.isFinite(principal) || principal <= 0) return unavailable('Isi plafond pinjaman yang valid.', extra);
  return { available: true, premium: Math.round(principal * rate / 1000), rate, age, years, message: `Usia asuransi ${age} tahun · tenor tarif ${years} tahun` };
}
function calculateCharges(x) {
  const insurance = calculateInsurance(x);
  const provision = Math.round(x.principal * x.provisionPercent / 100);
  const deductions = insurance.available ? provision + x.admin + insurance.premium + x.payoff : null;
  return { insurance, provision, deductions, net: deductions === null ? null : x.principal - deductions };
}
if (typeof module !== 'undefined') module.exports = { calculateInsurance, calculateCharges, completedMonths };
