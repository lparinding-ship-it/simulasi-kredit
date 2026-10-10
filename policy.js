const PRODUCT_NAMES = { asn: 'KREDIT CPNS/ASN', pension: 'KREDIT PENSIUN', business: 'KREDIT USAHA' };
function ageLimitDate(birth, years) {
  const [y, m, d] = birth.split('-').map(Number);
  const last = new Date(Date.UTC(y + years, m, 0)).getUTCDate();
  return `${y + years}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
function checkProductPolicy(x, maturity) {
  const messages = [];
  const maxIdir = x.product === 'pension' ? 85 : 95;
  if (Number.isFinite(x.idir) && x.idir > maxIdir) messages.push('Kurangi Persetasi IDIR, Melebihi Ketentuan SKDIR');
  const ageLimit = x.product === 'asn' ? (x.position === 'functional' ? 60 : 58) : x.product === 'pension' ? 75 : null;
  let deadline = null, needsBirth = false;
  if (ageLimit !== null) {
    const birth = new Date((x.birth || '') + 'T00:00:00Z');
    const validBirth = /^\d{4}-\d{2}-\d{2}$/.test(x.birth || '') && Number.isFinite(birth.getTime()) && birth.toISOString().slice(0, 10) === x.birth && x.birth <= x.start;
    if (!validBirth) needsBirth = true;
    else {
      deadline = ageLimitDate(x.birth, ageLimit);
      if (maturity && maturity > deadline) messages.push(x.product === 'pension' ? 'Kredit Tidak Dapat Dilayani' : 'Jangka Waktu Melebihi BUP');
    }
  }
  return { productName: PRODUCT_NAMES[x.product], ageLimit, deadline, needsBirth, messages, maxIdir };
}
if (typeof module !== 'undefined') module.exports = { checkProductPolicy, ageLimitDate, PRODUCT_NAMES };
