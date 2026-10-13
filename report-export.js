/* Laporan Admin Simulasi Kredit: CSV + Excel OOXML lokal tanpa CDN / backend. */
(() => {
  'use strict';
  const safe = s => String(s ?? '');
  const xml = s => safe(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
  const escapeCSV = s => {
    let v = safe(s);
    // Hindari eksekusi formula pada CSV di Excel/LibreOffice.
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(v)) v = "'" + v;
    return '"'+v.replace(/"/g,'""')+'"';
  };
  const encoder = new TextEncoder();
  const crcTable = new Uint32Array(256);
  for(let n=0;n<256;n++){ let c=n;for(let k=0;k<8;k++)c=c&1 ? 0xEDB88320^(c>>>1):c>>>1;crcTable[n]=c>>>0; }
  function crc32(bytes){let c=0xFFFFFFFF;for(let i=0;i<bytes.length;i++)c=crcTable[(c^bytes[i])&255]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
  function zip(files) {
    const chunks=[],central=[]; let position=0;
    function put16(view,idx,v){view.setUint16(idx,v,true);}function put32(view,idx,v){view.setUint32(idx,v>>>0,true);}
    for(const [name,contents] of files){
      const n=encoder.encode(name),b=contents instanceof Uint8Array?contents:encoder.encode(contents),checksum=crc32(b);
      const h=new Uint8Array(30+n.length),v=new DataView(h.buffer);
      put32(v,0,0x04034b50);put16(v,4,20);put16(v,6,0x0800);put16(v,8,0);put32(v,14,checksum);put32(v,18,b.length);put32(v,22,b.length);put16(v,26,n.length);h.set(n,30);
      const offset=position;position+=h.length+b.length;chunks.push(h,b);
      const ch=new Uint8Array(46+n.length),cv=new DataView(ch.buffer);
      put32(cv,0,0x02014b50);put16(cv,4,20);put16(cv,6,20);put16(cv,8,0x0800);put16(cv,10,0);
      put32(cv,16,checksum);put32(cv,20,b.length);put32(cv,24,b.length);put16(cv,28,n.length);put32(cv,42,offset);ch.set(n,46);central.push(ch);
    }
    const centralOffset=position;for(const c of central){chunks.push(c);position+=c.length;}
    const end=new Uint8Array(22),ev=new DataView(end.buffer);
    put32(ev,0,0x06054b50);put16(ev,8,central.length);put16(ev,10,central.length);put32(ev,12,position-centralOffset);put32(ev,16,centralOffset);chunks.push(end);
    return new Blob(chunks,{type:'application/zip'});
  }
  const colName = i => {let r='';for(let n=i;n>0;n=Math.floor((n-1)/26))r=String.fromCharCode(65+(n-1)%26)+r;return r;};
  const num = x => Number.isFinite(x) ? x : 0;
  function worksheet(headers, rows, monetaryColumns=[]) {
    const money = new Set(monetaryColumns), cols = headers.map((h,j)=>`<col min="${j+1}" max="${j+1}" width="${Math.min(34,Math.max(13,h.length+6))}" customWidth="1"/>`).join('');
    const write = (row,index,head=false) => '<row r="'+index+'">'+row.map((v,j)=>{
      const address=colName(j+1)+index;
      if(!head && (money.has(j)||typeof v==='number'))return `<c r="${address}" s="${money.has(j)?2:3}"><v>${num(Number(v))}</v></c>`;
      return `<c r="${address}" s="${head?1:0}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
    }).join('')+'</row>';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${cols}</cols><sheetData>${write(headers,1,true)}${rows.map((r,i)=>write(r,i+2)).join('')}</sheetData><autoFilter ref="A1:${colName(headers.length)}${Math.max(1,rows.length+1)}"/></worksheet>`;
  }
  function excel(tables){
    const sheetNames=tables.map(t=>t.name);
    const files=[
      ['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${tables.map((t,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
      ['_rels/.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetNames.map((n,i)=>`<sheet name="${xml(n)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`],
      ['xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${tables.map((t,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${tables.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ['xl/styles.xml',`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;Rp&quot; #,##0;[Red](&quot;Rp&quot; #,##0)"/></numFmts><fonts count="2"><font><sz val="10"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF194D85"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`]
    ];
    tables.forEach((t,i)=>files.push([`xl/worksheets/sheet${i+1}.xml`,worksheet(t.headers,t.rows,t.moneyCols||[])]));
    return new Blob([zip(files)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  // Workbook tunggal untuk kebutuhan dashboard + rekap + transaksi dalam SATU SHEET.
  // Tetap memakai OOXML lokal, sehingga aplikasi tidak mengirim data ke server pihak ketiga.
  function excelUnified(tables, options={}) {
    const data=tables.find(t=>t.name==='Aktivitas')||{headers:[],rows:[]};
    const ao=tables.find(t=>t.name==='Rekap AO')||{headers:[],rows:[]};
    const branch=tables.find(t=>t.name==='Rekap Cabang')||{headers:[],rows:[]};
    const info=tables.find(t=>t.name==='Keterangan')||{rows:[]};
    const kv=new Map(info.rows||[]);
    const width=[25,23,19,21,32,27,25,23,26,23,25];
    let sheetRows=[], merge=[], positions={},lastRow=0;
    const totalA=ao.rows.reduce((r,x)=>{r.access+=num(+x[2]);r.saved+=num(+x[3]);r.principal+=num(+x[4]);r.net+=num(+x[5]);return r;},{access:0,saved:0,principal:0,net:0});
    const numericCount = v => Number.isFinite(+v)?+v:0;
    // Style identifiers are defined below in unifiedStyles.
    const item = (value,style=0,formula=null,cached=null) => ({value,style,formula,cached});
    function row(index,items,{height,hidden}={}) {sheetRows.push({index,items,height,hidden});lastRow=Math.max(lastRow,index);}
    function merged(r,a,b,value,style=0,height) {
      // Isi gaya warna ke SEMUA sel pada merge agar judul/band tidak menjadi pola titik di Microsoft Excel.
      let cells=Array.from({length:11},(_,i)=>i>=a-1&&i<=b-1?item('',style):null);
      cells[a-1]=item(value,style);
      row(r,cells,{height});merge.push(`${colName(a)}${r}:${colName(b)}${r}`);
    }
    // We merge KPI blocks twice (label row + numeric row), avoiding duplicate values.
    merged(1,1,11,'MONITORING AKTIVITAS SIMULASI KREDIT',1,43);
    merged(2,1,11,'LAPORAN INTERNAL  |  REKAP AO, CABANG DAN DETAIL AKTIVITAS',2,29);
    merged(3,1,11,`Periode: ${kv.get('Awal periode')||'-'} s.d. ${kv.get('Akhir periode')||'-'}  |  Cabang: ${kv.get('Filter cabang')||'Semua'}  |  AO: ${kv.get('Filter AO')||'Semua'}  |  Produk: ${kv.get('Filter produk')||'Semua'}`,8,28);
    merged(4,1,11,`Diunduh: ${kv.get('Tanggal unduh')||new Date().toLocaleString('id-ID')}  |  Aktivitas: ${kv.get('Filter aktivitas')||'Semua'}  |  Pencarian: ${kv.get('Pencarian')||'Tidak ada'}  |  SIMULASI BUKAN REALISASI PENCAIRAN`,8,28);
    const kpi=[
      [1,2,'PENGGUNA TERDAFTAR',numericCount(options.registeredUsers)],
      [3,4,'AKTIVITAS TERCATAT',data.rows.length],
      [5,6,'AKSES APLIKASI',totalA.access],
      [7,8,'SIMULASI UNIK',totalA.saved],
      [9,11,'TOTAL PLAFON',totalA.principal]
    ];
    const label=Array(11).fill(null),values=Array(11).fill(null);
    for(const [a,b,title,v] of kpi){
      for(let n=a;n<=b;n++){label[n-1]=item('',5);values[n-1]=item('',a===9?7:6);}
      label[a-1]=item(title,5);values[a-1]=item(v,a===9?7:6);
      merge.push(`${colName(a)}5:${colName(b)}5`,`${colName(a)}6:${colName(b)}6`);
    }
    row(5,label,{height:29});row(6,values,{height:38});
    let netRows=Array.from({length:11},(_,i)=>item('',i>=8?10:9));
    netRows[0]=item('TOTAL DANA BERSIH TERSIMPAN  |  SIMULASI UNIK, BUKAN PENCAIRAN',9);
    netRows[8]=item(totalA.net,10);
    merge.push('A8:H8','I8:K8');row(8,netRows,{height:34});
    let r=10;
    function section(heading,headers,rows,fieldTypes,totals){
      merged(r,1,11,heading,3,34);r++;
      const h=Array(11).fill(null);headers.forEach((v,i)=>h[i]=item(v,4));row(r,h,{height:36});r++;
      const first=r;
      for(let ix=0;ix<rows.length;ix++){
        const out=Array(11).fill(null);
        rows[ix].forEach((v,j)=>{out[j]=item(v,(fieldTypes||[]).includes(j)?(ix%2?12:11):(ix%2?14:13));});
        row(r++,out,{height:28});
      }
      if(rows.length===0){const empty=Array(11).fill(null);empty[0]=item('Tidak ada catatan sesuai filter',8);row(r++,empty,{height:23});}
      const last=r-1;
      if(totals){
        const cells=Array(11).fill(null);cells[0]=item('TOTAL',15);
        for(const [idx,cache] of Object.entries(totals)) {
          const col=colName(+idx+1);
          // Excel recalculates when edited; cached totals display in other viewers.
          const formula=rows.length?`SUM(${col}${first}:${col}${last})`:null;
          cells[idx]=item(cache,+idx>=4?16:15,formula,cache);
        }
        row(r++,cells,{height:31});
      }
      return {start:first,stop:last,after:r};
    }
    const aoT=section('01  REKAP KINERJA PER AO',ao.headers,ao.rows,[4,5],{2:totalA.access,3:totalA.saved,4:totalA.principal,5:totalA.net});
    r+=2;
    const totalsBranch=branch.rows.reduce((acc,x)=>{acc.access+=num(+x[2]);acc.saved+=num(+x[3]);acc.principal+=num(+x[4]);acc.net+=num(+x[5]);return acc;},{access:0,saved:0,principal:0,net:0});
    section('02  REKAP KINERJA PER CABANG',branch.headers,branch.rows,[4,5],{2:totalsBranch.access,3:totalsBranch.saved,4:totalsBranch.principal,5:totalsBranch.net});
    r+=2;
    merged(r++,1,11,'03  DETAIL SELURUH AKTIVITAS SESUAI FILTER',3,34);
    merged(r++,1,11,'Angka pada open_app/cetak bukan penyaluran kredit. Nilai plafon dan dana bersih untuk total hanya dihitung dari save_simulation unik.',8,24);
    const detailHeader=r;
    const dh=Array(11).fill(null);data.headers.forEach((v,i)=>dh[i]=item(v,4));row(r++,dh,{height:37});
    const detailBegin=r;
    for(let ix=0;ix<data.rows.length;ix++){
      const record=data.rows[ix],isSave=record[3]==='save_simulation';
      const cells=Array(11).fill(null);
      record.forEach((v,j)=>cells[j]=item(v,j>=7?(isSave?18:ix%2?12:11):(isSave?17:ix%2?14:13)));
      row(r++,cells,{height:28});
    }
    if(!data.rows.length){const empty=Array(11).fill(null);empty[0]=item('Tidak ada aktivitas pada filter yang dipilih.',8);row(r++,empty,{height:22});}
    const detailStop=r-1;
    r+=2;
    merged(r++,1,11,'KETERANGAN & PENGENDALIAN',3,33);
    for(const note of [
      'Total plafon/dana bersih = nilai save_simulation terbaru per kombinasi UID AO + nomor referensi pada hasil filter.',
      'Data yang diunduh adalah simulasi indikatif, BUKAN realisasi pencairan kredit atau bukti dokumen sudah dicetak.',
      'Filter tanggal berdasarkan waktu pencatatan aktivitas. Ekspor mencakup seluruh hasil filter, bukan hanya halaman tabel.',
      'Dokumen berisi data pribadi/keuangan. Simpan pada perangkat yang diizinkan sesuai kebijakan retensi dan keamanan bank.'
    ])merged(r++,1,11,note,8,30);
    const styleXML=`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <numFmts count="2"><numFmt numFmtId="164" formatCode="&quot;Rp&quot; #,##0;[Red](&quot;Rp&quot; #,##0);&quot;Rp&quot; 0"/><numFmt numFmtId="165" formatCode="#,##0"/></numFmts>
      <fonts count="7">
        <font><sz val="11"/><name val="Aptos"/><color rgb="FF203C59"/></font>
        <font><sz val="20"/><name val="Aptos Display"/><b/><color rgb="FFFFFFFF"/></font>
        <font><sz val="11"/><name val="Aptos"/><color rgb="FFD9E8F7"/></font>
        <font><sz val="12"/><name val="Aptos"/><b/><color rgb="FFFFFFFF"/></font>
        <font><sz val="11"/><name val="Aptos"/><b/><color rgb="FF193F64"/></font>
        <font><sz val="16"/><name val="Aptos Display"/><b/><color rgb="FF103B64"/></font>
        <font><sz val="16"/><name val="Aptos Display"/><b/><color rgb="FF12634D"/></font>
      </fonts>
      <fills count="7">
        <fill><patternFill patternType="none"/></fill>
        <fill><patternFill patternType="solid"><fgColor rgb="FF143D63"/><bgColor indexed="64"/></patternFill></fill>
        <fill><patternFill patternType="solid"><fgColor rgb="FF265C90"/><bgColor indexed="64"/></patternFill></fill>
        <fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>
        <fill><patternFill patternType="solid"><fgColor rgb="FFF4F8FC"/><bgColor indexed="64"/></patternFill></fill>
        <fill><patternFill patternType="solid"><fgColor rgb="FFE1F4EC"/><bgColor indexed="64"/></patternFill></fill>
        <fill><patternFill patternType="solid"><fgColor rgb="FFFFFFFF"/><bgColor indexed="64"/></patternFill></fill>
      </fills>
      <borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFE0E9F1"/></bottom><diagonal/></border></borders>
      <cellStyleXfs count="1"><xf fontId="0" fillId="0" borderId="0" numFmtId="0"/></cellStyleXfs>
      <cellXfs count="19">
        <xf fontId="0" fillId="0" borderId="0" numFmtId="0" xfId="0"/>
        <xf fontId="1" fillId="1" borderId="0" numFmtId="0" xfId="0" applyFill="1" applyFont="1"><alignment vertical="center" horizontal="left" indent="1"/></xf>
        <xf fontId="2" fillId="1" borderId="0" numFmtId="0" xfId="0" applyFill="1" applyFont="1"><alignment vertical="center" horizontal="left" indent="1"/></xf>
        <xf fontId="3" fillId="2" borderId="0" numFmtId="0" xfId="0" applyFill="1" applyFont="1"><alignment vertical="center" horizontal="left" indent="1"/></xf>
        <xf fontId="4" fillId="3" borderId="1" numFmtId="0" xfId="0" applyFill="1" applyFont="1"><alignment vertical="center" horizontal="left" indent="1" wrapText="1"/></xf>
        <xf fontId="4" fillId="3" borderId="0" numFmtId="0" xfId="0" applyFill="1" applyFont="1"><alignment vertical="center" horizontal="left" indent="1" wrapText="1"/></xf>
        <xf fontId="5" fillId="3" borderId="0" numFmtId="165" xfId="0" applyFill="1" applyFont="1" applyNumberFormat="1"><alignment vertical="center" horizontal="center"/></xf>
        <xf fontId="5" fillId="3" borderId="0" numFmtId="164" xfId="0" applyFill="1" applyFont="1" applyNumberFormat="1"><alignment vertical="center" horizontal="center"/></xf>
        <xf fontId="0" fillId="6" borderId="0" numFmtId="0" xfId="0"><alignment vertical="center" horizontal="left" indent="1" wrapText="1"/></xf>
        <xf fontId="4" fillId="5" borderId="0" numFmtId="0" xfId="0" applyFill="1" applyFont="1"><alignment vertical="center" horizontal="left" indent="1"/></xf>
        <xf fontId="6" fillId="5" borderId="0" numFmtId="164" xfId="0" applyFill="1" applyFont="1" applyNumberFormat="1"><alignment vertical="center" horizontal="right" indent="1"/></xf>
        <xf fontId="0" fillId="6" borderId="1" numFmtId="164" xfId="0" applyFill="1" applyNumberFormat="1"><alignment vertical="center" horizontal="right" indent="1"/></xf>
        <xf fontId="0" fillId="4" borderId="1" numFmtId="164" xfId="0" applyFill="1" applyNumberFormat="1"><alignment vertical="center" horizontal="right" indent="1"/></xf>
        <xf fontId="0" fillId="6" borderId="1" numFmtId="0" xfId="0"><alignment vertical="center" horizontal="left" indent="1"/></xf>
        <xf fontId="0" fillId="4" borderId="1" numFmtId="0" xfId="0" applyFill="1"><alignment vertical="center" horizontal="left" indent="1"/></xf>
        <xf fontId="4" fillId="3" borderId="1" numFmtId="165" xfId="0" applyFill="1" applyFont="1" applyNumberFormat="1"><alignment vertical="center" horizontal="right" indent="1"/></xf>
        <xf fontId="4" fillId="3" borderId="1" numFmtId="164" xfId="0" applyFill="1" applyFont="1" applyNumberFormat="1"><alignment vertical="center" horizontal="right" indent="1"/></xf>
        <xf fontId="4" fillId="5" borderId="1" numFmtId="0" xfId="0" applyFill="1" applyFont="1"><alignment vertical="center" horizontal="left" indent="1"/></xf>
        <xf fontId="6" fillId="5" borderId="1" numFmtId="164" xfId="0" applyFill="1" applyFont="1" applyNumberFormat="1"><alignment vertical="center" horizontal="right" indent="1"/></xf>
      </cellXfs>
      <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
    </styleSheet>`;
    function emitCell(r,c,v){
      const a=colName(c+1)+r,fmt=` r="${a}" s="${v.style}"`;
      if(v.formula){return `<c${fmt}><f>${xml(v.formula)}</f><v>${num(v.cached)}</v></c>`;}
      if(typeof v.value==='number'){return `<c${fmt}><v>${num(v.value)}</v></c>`;}
      return `<c${fmt} t="inlineStr"><is><t xml:space="preserve">${xml(v.value)}</t></is></c>`;
    }
    const rowXML=sheetRows.map(ro=>`<row r="${ro.index}"${ro.height?` ht="${ro.height}" customHeight="1"`:''}>${ro.items.map((v,i)=>v?emitCell(ro.index,i,v):'').join('')}</row>`).join('');
    const colXML=width.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('');
    const sheetXML=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
      <sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="100" zoomScaleNormal="100"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
      <sheetFormatPr defaultRowHeight="22"/><cols>${colXML}</cols><sheetData>${rowXML}</sheetData>
      <autoFilter ref="A${detailHeader}:K${detailStop}"/>
      <mergeCells count="${merge.length}">${merge.map(m=>`<mergeCell ref="${m}"/>`).join('')}</mergeCells>
      <printOptions horizontalCentered="0"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.25" footer="0.25"/>
      <pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/>
      </worksheet>`;
    const files=[
      ['[Content_Types].xml','<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
      ['_rels/.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
      ['xl/workbook.xml','<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="MONITORING TERPADU" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>'],
      ['xl/_rels/workbook.xml.rels','<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
      ['xl/styles.xml',styleXML],['xl/worksheets/sheet1.xml',sheetXML]
    ];
    return new Blob([zip(files)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  const csv = (headers,rows) => '\uFEFF'+[headers,...rows].map(row=>row.map(escapeCSV).join(';')).join('\r\n');
  function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),15000);}
  function csvArchive(tables){return zip(tables.map(t=>[t.name.replace(/\s+/g,'_')+'.csv',csv(t.headers,t.rows)]));}
  window.SIM_REPORT_EXPORT={excel,excelUnified,csvArchive,download};
})();
