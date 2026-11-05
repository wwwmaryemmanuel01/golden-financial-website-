/* Minimal, dependency-free PDF writer (Helvetica core fonts).
   Produces genuine, valid PDF files for receipts, statements and agreements. */

const PAGE_W = 595.28, PAGE_H = 841.89; // A4 points
const esc = s => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
// WinAnsi-safe: strip characters the core fonts cannot render
const safe = s => String(s == null ? '' : s).replace(/[^\x20-\x7E\xA0-\xFF]/g, c => ({ '—': '-', '–': '-', '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...', '•': '-', '≥': '>=', '≤': '<=', '✓': 'v', '·': '-' }[c] || ''));

export class PDF {
  constructor({ title = 'Document', margin = 48 } = {}) {
    this.title = title; this.margin = margin;
    this.pages = []; this.cur = null;
    this.addPage();
  }
  addPage() {
    this.cur = { ops: [], y: PAGE_H - this.margin };
    this.pages.push(this.cur);
    return this;
  }
  ensure(h) { if (this.cur.y - h < this.margin + 30) this.addPage(); }
  text(str, { size = 10, bold = false, color = [0.1, 0.12, 0.16], x = this.margin, align = 'left', width = PAGE_W - this.margin * 2, gap = 4 } = {}) {
    const lines = this.wrap(safe(str), size, bold, width);
    for (const line of lines) {
      this.ensure(size + gap);
      const w = this.textWidth(line, size, bold);
      let tx = x;
      if (align === 'right') tx = x + width - w;
      if (align === 'center') tx = x + (width - w) / 2;
      this.cur.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color.join(' ')} rg 1 0 0 1 ${tx.toFixed(2)} ${(this.cur.y - size).toFixed(2)} Tm (${esc(line)}) Tj ET`);
      this.cur.y -= size + gap;
    }
    return this;
  }
  space(h = 8) { this.cur.y -= h; return this; }
  line(color = [0.79, 0.64, 0.15], w = 1) {
    this.ensure(10);
    this.cur.ops.push(`${color.join(' ')} RG ${w} w ${this.margin} ${this.cur.y.toFixed(2)} m ${(PAGE_W - this.margin).toFixed(2)} ${this.cur.y.toFixed(2)} l S`);
    this.cur.y -= 8; return this;
  }
  rect(x, y, w, h, color) { this.cur.ops.push(`${color.join(' ')} rg ${x} ${y} ${w} ${h} re f`); return this; }
  kv(label, value, opts = {}) {
    const size = opts.size || 10;
    this.ensure(size + 6);
    const y = this.cur.y - size;
    this.cur.ops.push(`BT /F1 ${size} Tf 0.35 0.4 0.47 rg 1 0 0 1 ${this.margin} ${y.toFixed(2)} Tm (${esc(safe(label))}) Tj ET`);
    const v = safe(String(value));
    const w = this.textWidth(v, size, true);
    this.cur.ops.push(`BT /F2 ${size} Tf 0.07 0.09 0.12 rg 1 0 0 1 ${(PAGE_W - this.margin - w).toFixed(2)} ${y.toFixed(2)} Tm (${esc(v)}) Tj ET`);
    this.cur.y -= size + 6;
    return this;
  }
  table(headers, rows, widths, { size = 8.5 } = {}) {
    const total = PAGE_W - this.margin * 2;
    const ws = widths.map(w => w * total);
    const rowH = size + 8;
    const drawRow = (cells, bold, bg) => {
      this.ensure(rowH + 4);
      const y = this.cur.y - rowH;
      if (bg) this.rect(this.margin, y, total, rowH, bg);
      let x = this.margin;
      cells.forEach((c, i) => {
        const t = safe(String(c));
        const maxW = ws[i] - 8;
        let txt = t;
        while (this.textWidth(txt, size, bold) > maxW && txt.length > 1) txt = txt.slice(0, -1);
        const alignRight = i > 0 && /^[\d.,\sMK%+-]+$/.test(t) && t.length > 0;
        const tw = this.textWidth(txt, size, bold);
        const tx = alignRight ? x + ws[i] - 4 - tw : x + 4;
        this.cur.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${bold ? '0.02 0.3 0.22' : '0.12 0.14 0.19'} rg 1 0 0 1 ${tx.toFixed(2)} ${(y + 5).toFixed(2)} Tm (${esc(txt)}) Tj ET`);
        x += ws[i];
      });
      this.cur.y -= rowH;
    };
    drawRow(headers, true, [0.85, 0.95, 0.91]);
    rows.forEach((r, idx) => drawRow(r, false, idx % 2 ? [0.97, 0.98, 0.97] : null));
    this.cur.y -= 6;
    return this;
  }
  /* crude Helvetica width approximation (good enough for layout) */
  textWidth(s, size, bold) {
    let w = 0;
    for (const ch of String(s)) {
      if ('iljItf.,:;!|\'`()[] '.includes(ch)) w += 0.30;
      else if ('MW@%&'.includes(ch)) w += 0.85;
      else if (ch >= 'A' && ch <= 'Z') w += 0.68;
      else if (ch >= '0' && ch <= '9') w += 0.56;
      else w += 0.52;
    }
    return w * size * (bold ? 1.05 : 1);
  }
  wrap(s, size, bold, width) {
    const words = String(s).split(/\s+/); const lines = []; let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (this.textWidth(test, size, bold) > width && line) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
  }
  header(company, subtitle, ref) {
    this.rect(0, PAGE_H - 86, PAGE_W, 86, [0.024, 0.306, 0.231]);
    this.cur.ops.push(`BT /F2 20 Tf 0.788 0.635 0.153 rg 1 0 0 1 ${this.margin} ${PAGE_H - 40} Tm (${esc(safe(company))}) Tj ET`);
    this.cur.ops.push(`BT /F1 9 Tf 0.85 0.93 0.89 rg 1 0 0 1 ${this.margin} ${PAGE_H - 58} Tm (${esc(safe(subtitle))}) Tj ET`);
    if (ref) this.cur.ops.push(`BT /F2 10 Tf 1 1 1 rg 1 0 0 1 ${PAGE_W - this.margin - this.textWidth(ref, 10, true)} ${PAGE_H - 40} Tm (${esc(safe(ref))}) Tj ET`);
    this.cur.y = PAGE_H - 110;
    return this;
  }
  footer(note) {
    for (const p of this.pages) {
      p.ops.push(`0.79 0.64 0.15 RG 0.8 w ${this.margin} 46 m ${PAGE_W - this.margin} 46 l S`);
      p.ops.push(`BT /F1 7.5 Tf 0.4 0.45 0.5 rg 1 0 0 1 ${this.margin} 34 Tm (${esc(safe(note))}) Tj ET`);
    }
    return this;
  }
  build() {
    const objects = [];
    const add = s => { objects.push(s); return objects.length; }; // 1-based
    const fontR = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
    const fontB = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>');
    const pageIds = [];
    const pagesId = objects.length + 1 + this.pages.length * 2; // computed below properly
    // We must know Pages object id before pages; reserve it.
    const pagesObjNum = objects.length + 1 + this.pages.length * 2;
    for (const p of this.pages) {
      const stream = p.ops.join('\n');
      const contentId = add(`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`);
      const pageId = add(`<< /Type /Page /Parent ${pagesObjNum} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${fontR} 0 R /F2 ${fontB} 0 R >> >> /Contents ${contentId} 0 R >>`);
      pageIds.push(pageId);
    }
    const realPagesId = add(`<< /Type /Pages /Kids [${pageIds.map(i => `${i} 0 R`).join(' ')}] /Count ${pageIds.length} >>`);
    if (realPagesId !== pagesObjNum) throw new Error('PDF object numbering error');
    const infoId = add(`<< /Title (${esc(safe(this.title))}) /Producer (Golden Financial Services) /CreationDate (D:${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}) >>`);
    const catalogId = add(`<< /Type /Catalog /Pages ${realPagesId} 0 R >>`);
    let out = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((body, i) => { offsets.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
    const xrefPos = Buffer.byteLength(out, 'latin1');
    out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i++) out += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
    out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF`;
    return Buffer.from(out, 'binary');
  }
}
