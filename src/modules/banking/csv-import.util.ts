/**
 * Parse common bank CSV formats into { date, description, amount } rows.
 * Supports:
 *  - Header row with Date / Description / Amount (case-insensitive, flexible names)
 *  - Optional Debit/Credit columns instead of a single Amount
 *  - AU-style DD/MM/YYYY and ISO YYYY-MM-DD dates
 *  - Amounts with $ , and parentheses for negatives
 */
export interface ParsedBankRow {
  date: string; // ISO YYYY-MM-DD
  description: string;
  amount: string; // signed decimal string, deposits positive
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function parseAmount(raw: string): number | null {
  if (!raw || !raw.trim()) return null;
  let s = raw.trim();
  let neg = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, '');
  if (s.startsWith('-')) {
    neg = true;
    s = s.slice(1);
  }
  const n = parseFloat(s);
  if (Number.isNaN(n)) return null;
  return neg ? -Math.abs(n) : n;
}

function parseDate(raw: string): string | null {
  const s = raw.trim();
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // DD/MM/YYYY or DD-MM-YYYY
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (m) {
    const d = m[1].padStart(2, '0');
    const mo = m[2].padStart(2, '0');
    return `${m[3]}-${mo}-${d}`;
  }
  // MM/DD/YYYY (US) — less common for AU banks; still accept if clearly month-first and day>12 handled by bank export conventions
  return null;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur);
  return out;
}

export function parseBankCsv(csvText: string): { rows: ParsedBankRow[]; errors: string[] } {
  const lines = csvText
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { rows: [], errors: ['CSV must include a header row and at least one data row'] };
  }

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const dateIdx = headers.findIndex((h) =>
    ['date', 'txndate', 'transactiondate', 'valuedate', 'posteddate'].includes(h),
  );
  const descIdx = headers.findIndex((h) =>
    ['description', 'narration', 'memo', 'details', 'particulars', 'reference', 'payee'].includes(h),
  );
  const amountIdx = headers.findIndex((h) =>
    ['amount', 'transactionamount', 'value', 'sum'].includes(h),
  );
  const debitIdx = headers.findIndex((h) => ['debit', 'withdrawal', 'moneyout'].includes(h));
  const creditIdx = headers.findIndex((h) => ['credit', 'deposit', 'moneyin'].includes(h));

  if (dateIdx < 0) {
    return { rows: [], errors: ['Could not find a Date column (Date, Transaction Date, Value Date, …)'] };
  }
  if (descIdx < 0) {
    return { rows: [], errors: ['Could not find a Description column (Description, Narration, Memo, …)'] };
  }
  if (amountIdx < 0 && debitIdx < 0 && creditIdx < 0) {
    return {
      rows: [],
      errors: ['Could not find Amount or Debit/Credit columns'],
    };
  }

  const rows: ParsedBankRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const dateRaw = cols[dateIdx] ?? '';
    const desc = (cols[descIdx] ?? '').trim() || 'Imported transaction';
    const date = parseDate(dateRaw);
    if (!date) {
      errors.push(`Row ${i + 1}: unrecognised date "${dateRaw}"`);
      continue;
    }

    let amount: number | null = null;
    if (amountIdx >= 0) {
      amount = parseAmount(cols[amountIdx] ?? '');
    } else {
      const debit = parseAmount(cols[debitIdx] ?? '') ?? 0;
      const credit = parseAmount(cols[creditIdx] ?? '') ?? 0;
      // Bank convention: credits (money in) positive, debits negative
      amount = credit - Math.abs(debit);
    }

    if (amount === null || amount === 0) {
      errors.push(`Row ${i + 1}: missing or zero amount`);
      continue;
    }

    rows.push({
      date,
      description: desc.slice(0, 500),
      amount: amount.toFixed(2),
    });
  }

  return { rows, errors };
}

/**
 * Minimal OFX SGML parser for bank statement transactions (STMTTRN).
 * Handles common bank export OFX without a full XML dependency.
 */
export function parseBankOfx(ofxText: string): { rows: ParsedBankRow[]; errors: string[] } {
  const rows: ParsedBankRow[] = [];
  const errors: string[] = [];
  const blocks = ofxText.split(/<STMTTRN>/i).slice(1);
  if (blocks.length === 0) {
    return { rows: [], errors: ['No STMTTRN blocks found in OFX file'] };
  }

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].split(/<\/STMTTRN>/i)[0];
    const get = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}>([^\\r\\n<]+)`, 'i'));
      return m ? m[1].trim() : '';
    };
    const dtPosted = get('DTPOSTED');
    const trnamt = get('TRNAMT');
    const memo = get('MEMO') || get('NAME') || 'OFX import';
    if (!dtPosted || !trnamt) {
      errors.push(`OFX transaction ${i + 1}: missing DTPOSTED or TRNAMT`);
      continue;
    }
    // DTPOSTED is often YYYYMMDD or YYYYMMDDHHMMSS
    const date = `${dtPosted.slice(0, 4)}-${dtPosted.slice(4, 6)}-${dtPosted.slice(6, 8)}`;
    const amount = parseFloat(trnamt);
    if (Number.isNaN(amount)) {
      errors.push(`OFX transaction ${i + 1}: bad amount ${trnamt}`);
      continue;
    }
    rows.push({ date, description: memo.slice(0, 500), amount: amount.toFixed(2) });
  }
  return { rows, errors };
}
