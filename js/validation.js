// ============================================
// ПРОВЕРКА ДАТ И МЕСТ
// ============================================

const MONTHS = [
  ['январ', 'янв'], ['феврал', 'фев'], ['март', 'мар'], ['апрел', 'апр'], ['ма', 'мая', 'май'], ['июн'],
  ['июл'], ['август', 'авг'], ['сентябр', 'сен', 'сент'], ['октябр', 'окт'], ['ноябр', 'ноя'], ['декабр', 'дек']
];

function monthFromWord(word) {
  const w = word.toLowerCase().replace('ё', 'е');
  if (w === 'май' || w === 'мая' || w === 'мае') return 5;
  for (let i = 0; i < MONTHS.length; i++) {
    if (i === 4) continue;
    if (MONTHS[i].some(stem => w.startsWith(stem) && w.length <= stem.length + 3)) return i + 1;
  }
  return null;
}

function daysInMonth(month, year) {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function checkParts(day, month, year) {
  if (!Number.isInteger(year) || year < 1 || year > 99999) return 'Год должен быть от 1 до 99999';
  if (month !== null && (month < 1 || month > 12)) return 'Месяц должен быть от 1 до 12';
  if (day !== null) {
    if (month === null) return 'Не указан месяц';
    const max = daysInMonth(month, year);
    if (day < 1 || day > max) return `В этом месяце нет ${day}-го числа (максимум ${max})`;
  }
  return null;
}

// Возвращает null, если дата корректна, иначе текст ошибки.
// Поддерживает: 2024 · 03.2024 · март 2024 · 15.03.2024 · 15/03/2024 · 2024-03-15 · 15 марта 2024 (можно с "г." / "года")
export function validateDate(input) {
  if (!input || !input.trim()) return null;
  const s = input.trim().toLowerCase().replace(/\s*(г\.?|года?)\s*$/, '').replace(/\s+/g, ' ');
  let m;
  if ((m = s.match(/^(\d{1,5})$/))) return checkParts(null, null, +m[1]);
  // период: 2035–2040
  if ((m = s.match(/^(\d{1,5})\s*[–—-]\s*(\d{1,5})$/)) && m[1].length >= 3 && m[2].length >= 3) {
    const err = checkParts(null, null, +m[1]) || checkParts(null, null, +m[2]);
    if (err) return err;
    return +m[1] <= +m[2] ? null : 'Начало периода позже конца';
  }
  if ((m = s.match(/^(\d{1,2})[./](\d{1,5})$/))) return checkParts(null, +m[1], +m[2]);
  if ((m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{1,5})$/))) return checkParts(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,5})-(\d{1,2})-(\d{1,2})$/))) return checkParts(+m[3], +m[2], +m[1]);
  if ((m = s.match(/^([а-яё]+) (\d{1,5})$/))) {
    const month = monthFromWord(m[1]);
    return month ? checkParts(null, month, +m[2]) : `Не понимаю месяц «${m[1]}»`;
  }
  if ((m = s.match(/^(\d{1,2}) ([а-яё]+) (\d{1,5})$/))) {
    const month = monthFromWord(m[2]);
    return month ? checkParts(+m[1], month, +m[3]) : `Не понимаю месяц «${m[2]}»`;
  }
  return 'Непонятный формат даты. Примеры: «2024», «2035–2040», «март 2024», «15 марта 2024», «15.03.2024»';
}

export function isValidDate(input) {
  return validateDate(input) === null;
}

// Поиск места на карте (бесплатно, без ключей).
// 1) Open-Meteo — города и населённые пункты; 2) OpenStreetMap Nominatim — страны, регионы, адреса.
// Возвращает { name, fullName, lat, lon } — место найдено; null — такого места нет;
// { name: input, lat: null, lon: null, unchecked: true } — сервисы недоступны (сохранение не блокируем).
const geoCache = new Map();

async function searchOpenMeteo(q) {
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?count=1&language=ru&name=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error('open-meteo ' + res.status);
  const hit = (await res.json()).results?.[0];
  if (!hit) return null;
  return { name: hit.name, fullName: [...new Set([hit.name, hit.admin1, hit.country].filter(Boolean))].join(', '), lat: hit.latitude, lon: hit.longitude };
}

async function searchNominatim(q) {
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&featureType=settlement&accept-language=ru&q=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error('nominatim ' + res.status);
  const hit = (await res.json())[0];
  // только населённые пункты, регионы и страны — не магазины и не улицы
  if (!hit || !['place', 'boundary'].includes(hit.category)) return null;
  return { name: hit.name || q, fullName: hit.display_name, lat: +hit.lat, lon: +hit.lon };
}

export async function geocodePlace(input) {
  const q = (input || '').trim();
  if (q.length < 2 || !/[a-zA-Zа-яА-ЯёЁ]/.test(q)) return null;
  const key = q.toLowerCase();
  if (geoCache.has(key)) return geoCache.get(key);
  let failures = 0, result = null;
  // Open-Meteo ищет по названию без запятых: «Москва, Россия» → «Москва»
  try { result = await searchOpenMeteo(q.split(',')[0].trim()); } catch (e) { failures++; console.warn(e); }
  if (!result) { try { result = await searchNominatim(q); } catch (e) { failures++; console.warn(e); } }
  if (!result && failures === 2) return { name: q, lat: null, lon: null, unchecked: true };
  geoCache.set(key, result);
  return result;
}
