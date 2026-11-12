import fs from 'node:fs';
import { extractText, getDocumentProxy } from 'unpdf';

function normalize(text) {
  return String(text || '')
    .normalize('NFKC')
    .replace(/[⻋⼀⽉⽇⾄⾥⼈⽤⽹⾃⽼⾮⼚⼯⽓⾦⾯⾏⾼]/g, (char) => ({
      '⻋': '车', '⼀': '一', '⽉': '月', '⽇': '日', '⾄': '至', '⾥': '里',
      '⼈': '人', '⽤': '用', '⽹': '网', '⾃': '自', '⽼': '老', '⾮': '非',
      '⼚': '厂', '⼯': '工', '⽓': '气', '⾦': '金', '⾯': '面', '⾏': '行', '⾼': '高'
    }[char] || char))
    .replace(/\r/g, '')
    .replace(/[：]/g, ':')
    .replace(/[（]/g, '(')
    .replace(/[）]/g, ')')
    .replace(/[－—]/g, '-');
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].trim();
  }
  return '';
}

function parseDate(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/(\d{4})\s*[年\-\/.]\s*(\d{1,2})\s*[月\-\/.]\s*(\d{1,2})/);
  if (!match) return '';
  return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
}

function parseAmount(value) {
  const n = Number(String(value || '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function splitSections(text) {
  const markers = ['保障范围', '保险责任', '责任免除', '除外责任', '不承保', '赔偿处理', '理赔', '免赔', '限额'];
  const lines = normalize(text).split('\n').map((line) => line.trim()).filter(Boolean);
  const sections = {};
  let current = 'preamble';
  sections[current] = [];
  for (const line of lines) {
    const heading = line.match(/^第[一二三四五六七八九十百\d]+条\s*(.*)$/);
    const candidate = (heading ? heading[1] : line).trim();
    const hit = markers.find((marker) => candidate === marker || candidate.startsWith(marker));
    if (hit) {
      current = hit;
      sections[current] = sections[current] || [];
    }
    sections[current].push(line);
  }
  return sections;
}

function sectionText(sections, names) {
  return names.map((name) => (sections[name] || []).join('\n')).join('\n');
}

function extractClauses(text) {
  const lines = normalize(text).split('\n').map((line) => line.trim()).filter(Boolean);
  const clauseRe = /^(第[一二三四五六七八九十百\d]+条|CL-[A-Z0-9-]+|\d+(?:\.\d+)+)[\s:：]*(.*)$/;
  const clauses = {};
  let currentId = '';
  for (const line of lines) {
    const match = line.match(clauseRe);
    if (match) {
      currentId = match[1].replace(/[：:]/g, '');
      clauses[currentId] = [match[2] || ''];
    } else if (currentId) {
      clauses[currentId].push(line);
    }
  }
  return Object.fromEntries(
    Object.entries(clauses)
      .map(([id, parts]) => [id, parts.join('\n').trim()])
      .filter(([, body]) => body.length > 0)
  );
}

function extractCoverage(sections, clauses) {
  const body = sectionText(sections, ['保障范围', '保险责任']);
  const lines = body.split('\n').filter(Boolean);
  const names = new Set();
  for (const line of lines) {
    const cleaned = line.replace(/^[-•·\d.、\s]+/, '').trim();
    if (/^第.+条/.test(cleaned)) continue;
    if (/^(保障范围|保险责任|下列|以下|本保单|保障范围包括)/.test(cleaned)) continue;
    const name = cleaned.split(/[:：]/)[0].trim();
    if (!name || name.length > 20) continue;
    if (/[，。；]/.test(name)) continue;
    names.add(name);
  }
  return [...names].slice(0, 12).map((name, index) => ({
    code: `AUTO-${index + 1}`,
    name,
    covered: true,
    clauseId: findClauseFor(name, clauses) || ''
  }));
}

function findClauseFor(text, clauses) {
  const needle = String(text || '').replace(/\s/g, '');
  for (const [id, body] of Object.entries(clauses)) {
    if (body.replace(/\s/g, '').includes(needle)) return id;
  }
  return '';
}

function extractExclusions(sections, clauses) {
  const body = sectionText(sections, ['责任免除', '除外责任', '不承保']);
  const lines = body.split('\n').filter((line) => line.length > 4);
  const keywordBank = ['营运', '网约车', '出租', '酒驾', '醉驾', '逃逸', '毒驾', '改装', '自然磨损', '老化', '保养不当', '轮胎', '玻璃'];
  const found = new Set();
  for (const line of lines) {
    for (const keyword of keywordBank) {
      if (line.includes(keyword)) found.add(keyword);
    }
  }
  return [...found].map((keyword, index) => ({
    code: `EX-AUTO-${index + 1}`,
    keywords: [keyword],
    clauseId: findClauseFor(keyword, clauses) || ''
  }));
}

/**
 * Extract text from a digital PDF. Scanned PDFs need OCR and are not supported.
 */
export async function extractPdfText(filePath) {
  const buffer = fs.readFileSync(filePath);
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text: normalize(text), totalPages };
}

/**
 * Best-effort policy parser. Always returns a draft plus warnings; review before use.
 */
export function parsePolicyText(rawText) {
  const text = normalize(rawText);
  const sections = splitSections(text);
  const clauses = extractClauses(text);
  const warnings = [];

  const policyNo = firstMatch(text, [
    /保单号?\s*[:：]?\s*([A-Z0-9][A-Z0-9-]{5,})/i,
    /(CT[A-Z]{2,}[A-Z0-9-]{4,})/i
  ]);
  if (!policyNo) warnings.push('未识别到保单号');

  const product = firstMatch(text, [
    /产品名称\s*[:：]?\s*(.+)/,
    /险种名称\s*[:：]?\s*(.+)/
  ]).split('\n')[0].trim();

  const periodMatch = text.match(/(\d{4}\s*[年\-\/.]\s*\d{1,2}\s*[月\-\/.]\s*\d{1,2})\s*日?\s*(?:至|到|-|~)\s*(\d{4}\s*[年\-\/.]\s*\d{1,2}\s*[月\-\/.]\s*\d{1,2})\s*日?/);
  const period = {
    start: periodMatch ? parseDate(periodMatch[1]) : '',
    end: periodMatch ? parseDate(periodMatch[2]) : ''
  };
  if (!period.start || !period.end) warnings.push('未识别到完整保障期间');

  const mileageLimit = parseAmount(firstMatch(text, [/里程(?:限制|上限)\s*[:：]?\s*([\d,]+)/, /承保里程\s*[:：]?\s*([\d,]+)/]));
  const deductible = parseAmount(firstMatch(text, [/免赔额\s*[:：]?\s*¥?\s*([\d,]+)/]));
  const perClaimLimit = parseAmount(firstMatch(text, [/单次(?:赔付)?限额\s*[:：]?\s*¥?\s*([\d,]+)/]));
  const annualLimit = parseAmount(firstMatch(text, [/年度(?:累计)?限额\s*[:：]?\s*¥?\s*([\d,]+)/]));
  const waitingDays = parseAmount(firstMatch(text, [/等待期\s*[:：]?\s*(\d+)\s*天/]));

  const coverage = extractCoverage(sections, clauses);
  const exclusions = extractExclusions(sections, clauses);
  if (!coverage.length) warnings.push('未识别到保障类别，请手工补充 coverage');
  if (!exclusions.length) warnings.push('未识别到免责条款，请手工补充 exclusions');
  if (!Object.keys(clauses).length) warnings.push('未识别到条款结构，citations 将为空');

  const policy = {
    policyNo: policyNo || 'UNKNOWN-POLICY',
    product: product || '未命名产品',
    status: 'active',
    insured: {
      name: firstMatch(text, [/被保险人\s*[:：]?\s*(.+)/]).split('\n')[0].trim(),
      vehicle: {
        vin: firstMatch(text, [/\b([A-HJ-NPR-Z0-9]{17})\b/]),
        brand: firstMatch(text, [/品牌\s*[:：]?\s*(.+)/]).split('\n')[0].trim(),
        model: firstMatch(text, [/车型\s*[:：]?\s*(.+)/]).split('\n')[0].trim(),
        purchasePrice: 0
      }
    },
    period,
    mileageLimit,
    waitingDays,
    deductible,
    perClaimLimit,
    annualLimit,
    annualUsed: 0,
    manualReviewThreshold: 20000,
    requireAttachments: true,
    coverage,
    exclusions,
    clauses
  };

  return { policy, clauses, warnings, rawText: text };
}

export async function importPolicyFromPdf(filePath) {
  const { text, totalPages } = await extractPdfText(filePath);
  const parsed = parsePolicyText(text);
  return { ...parsed, totalPages };
}

export default importPolicyFromPdf;
