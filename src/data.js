/* DEVERSE — fictional but plausible developer dataset.
   Seeded so it's stable across reloads. Exported as the default module value. */

// --- seeded RNG (mulberry32) ---
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20260608);
const rand = () => rng();
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const pickN = (arr, n) => {
  const pool = arr.slice();
  const out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  return out;
};
const jit = (v, amt) => v + (rand() - 0.5) * amt;

// --- cities (real coords) with cultural name-pool keys for plausibility ---
const CITIES = [
  ["San Francisco", "USA", 37.77, -122.42, "us", 14],
  ["New York", "USA", 40.71, -74.0, "us", 12],
  ["Seattle", "USA", 47.6, -122.33, "us", 8],
  ["Austin", "USA", 30.27, -97.74, "us", 7],
  ["Toronto", "Canada", 43.65, -79.38, "us", 7],
  ["Vancouver", "Canada", 49.28, -123.12, "us", 4],
  ["Mexico City", "Mexico", 19.43, -99.13, "latam", 6],
  ["São Paulo", "Brazil", -23.55, -46.63, "latam", 9],
  ["Buenos Aires", "Argentina", -34.6, -58.38, "latam", 6],
  ["Bogotá", "Colombia", 4.71, -74.07, "latam", 4],
  ["Santiago", "Chile", -33.45, -70.66, "latam", 3],
  ["London", "UK", 51.5, -0.12, "uk", 12],
  ["Berlin", "Germany", 52.52, 13.4, "de", 11],
  ["Paris", "France", 48.85, 2.35, "fr", 9],
  ["Amsterdam", "Netherlands", 52.37, 4.9, "nl", 6],
  ["Stockholm", "Sweden", 59.33, 18.06, "nordic", 6],
  ["Copenhagen", "Denmark", 55.68, 12.57, "nordic", 4],
  ["Helsinki", "Finland", 60.17, 24.94, "nordic", 4],
  ["Madrid", "Spain", 40.42, -3.7, "es", 6],
  ["Barcelona", "Spain", 41.39, 2.17, "es", 5],
  ["Lisbon", "Portugal", 38.72, -9.14, "es", 4],
  ["Warsaw", "Poland", 52.23, 21.0, "pl", 6],
  ["Kyiv", "Ukraine", 50.45, 30.52, "pl", 5],
  ["Tallinn", "Estonia", 59.43, 24.75, "pl", 3],
  ["Tel Aviv", "Israel", 32.08, 34.78, "il", 6],
  ["Lagos", "Nigeria", 6.52, 3.38, "ng", 6],
  ["Nairobi", "Kenya", -1.29, 36.82, "ng", 4],
  ["Accra", "Ghana", 5.6, -0.19, "ng", 3],
  ["Cairo", "Egypt", 30.04, 31.24, "ar", 4],
  ["Cape Town", "South Africa", -33.92, 18.42, "za", 4],
  ["Bengaluru", "India", 12.97, 77.59, "in", 13],
  ["Mumbai", "India", 19.08, 72.88, "in", 7],
  ["Delhi", "India", 28.61, 77.21, "in", 6],
  ["Hyderabad", "India", 17.39, 78.49, "in", 5],
  ["Singapore", "Singapore", 1.35, 103.82, "sea", 6],
  ["Tokyo", "Japan", 35.68, 139.69, "jp", 10],
  ["Osaka", "Japan", 34.69, 135.5, "jp", 4],
  ["Seoul", "South Korea", 37.57, 126.98, "kr", 8],
  ["Shanghai", "China", 31.23, 121.47, "cn", 8],
  ["Shenzhen", "China", 22.54, 114.06, "cn", 8],
  ["Beijing", "China", 39.9, 116.4, "cn", 7],
  ["Taipei", "Taiwan", 25.03, 121.57, "cn", 4],
  ["Jakarta", "Indonesia", -6.21, 106.85, "sea", 5],
  ["Manila", "Philippines", 14.6, 120.98, "sea", 5],
  ["Bangkok", "Thailand", 13.76, 100.5, "sea", 4],
  ["Ho Chi Minh City", "Vietnam", 10.82, 106.63, "sea", 5],
  ["Sydney", "Australia", -33.87, 151.21, "au", 7],
  ["Melbourne", "Australia", -37.81, 144.96, "au", 6],
  ["Auckland", "New Zealand", -36.85, 174.76, "au", 3],
  ["Dubai", "UAE", 25.2, 55.27, "ar", 5],
  ["Istanbul", "Turkey", 41.01, 28.98, "tr", 6],
  ["Moscow", "Russia", 55.76, 37.62, "ru", 7],
];

const NAMES = {
  us: { f: ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Avery", "Quinn", "Sam", "Dana", "Chris", "Jamie", "Devon", "Skylar", "Reese"], l: ["Carter", "Reed", "Nguyen", "Bennett", "Foster", "Hayes", "Brooks", "Pierce", "Sloan", "Vance", "Wallace", "Mercer"] },
  latam: { f: ["Mateo", "Sofía", "Diego", "Valentina", "Lucas", "Camila", "Tomás", "Isabela", "Joaquín", "Lucía", "Bruno", "Renata"], l: ["García", "Silva", "Rodríguez", "Santos", "Oliveira", "Fernández", "Costa", "Morales", "Vega", "Rojas"] },
  uk: { f: ["Oliver", "Amelia", "Harry", "Isla", "George", "Freya", "Arthur", "Maya", "Leo", "Nina", "Theo", "Esme"], l: ["Whitfield", "Ashworth", "Holloway", "Pembroke", "Hartley", "Davies", "Okafor", "Sinclair", "Quinn"] },
  de: { f: ["Lukas", "Mia", "Felix", "Lena", "Jonas", "Hannah", "Niklas", "Lea", "Paul", "Emilia", "Moritz"], l: ["Schmidt", "Wagner", "Becker", "Hoffmann", "Krüger", "Vogel", "Brandt", "Lehmann", "Roth"] },
  fr: { f: ["Lucas", "Emma", "Hugo", "Léa", "Nathan", "Chloé", "Théo", "Manon", "Enzo", "Inès", "Adam", "Jade"], l: ["Lefèvre", "Moreau", "Dubois", "Laurent", "Girard", "Mercier", "Bonnet", "Faure", "Roussel"] },
  nl: { f: ["Daan", "Sanne", "Bram", "Fenna", "Sem", "Lieke", "Lars", "Tess", "Jens"], l: ["de Vries", "Jansen", "Bakker", "Visser", "Smit", "Meijer", "Mulder", "de Boer"] },
  nordic: { f: ["Erik", "Astrid", "Magnus", "Ingrid", "Oskar", "Sigrid", "Aksel", "Freja", "Emil", "Saga"], l: ["Lindberg", "Hansen", "Larsen", "Nyström", "Virtanen", "Sørensen", "Holm", "Aalto"] },
  es: { f: ["Pablo", "Lucía", "Hugo", "Martina", "Álvaro", "Carla", "Marc", "Sara", "Iker", "Nuria"], l: ["Fernández", "Ruiz", "Serra", "Iglesias", "Navarro", "Castro", "Reyes", "Pinto"] },
  pl: { f: ["Jakub", "Zofia", "Kacper", "Oleksandr", "Marta", "Mykola", "Ola", "Piotr", "Kateryna"], l: ["Kowalski", "Nowak", "Shevchenko", "Wójcik", "Kovalenko", "Kaminski", "Bondarenko", "Tamm"] },
  il: { f: ["Noa", "Itai", "Maya", "Yael", "Eitan", "Tal", "Lior", "Shira", "Omer"], l: ["Cohen", "Levi", "Mizrahi", "Bar-On", "Friedman", "Avraham", "Shapira"] },
  ng: { f: ["Chidi", "Amara", "Tunde", "Zainab", "Emeka", "Kwame", "Adaeze", "Kofi", "Yaa", "Sade"], l: ["Okafor", "Adeyemi", "Mensah", "Okonkwo", "Balogun", "Owusu", "Eze", "Achebe"] },
  ar: { f: ["Omar", "Layla", "Karim", "Nour", "Yousef", "Aya", "Khaled", "Salma", "Tariq"], l: ["Hassan", "Al-Farsi", "Mansour", "Haddad", "Khalil", "Saleh", "Nasser"] },
  za: { f: ["Sipho", "Lerato", "Thabo", "Naledi", "Johan", "Anika", "Bongani"], l: ["Naidoo", "van der Merwe", "Dlamini", "Botha", "Mokoena", "Pillay"] },
  in: { f: ["Aarav", "Diya", "Vihaan", "Ananya", "Arjun", "Isha", "Rohan", "Priya", "Kabir", "Meera", "Aditya", "Riya"], l: ["Sharma", "Patel", "Reddy", "Iyer", "Nair", "Gupta", "Rao", "Menon", "Khan", "Banerjee"] },
  sea: { f: ["Wei", "Putri", "Bayu", "Ananda", "Minh", "Linh", "Jun", "Siti", "Arif", "Mei"], l: ["Tan", "Wijaya", "Santos", "Pham", "Nguyen", "Lim", "Reyes", "Cruz", "Setiawan"] },
  jp: { f: ["Haruto", "Yui", "Sota", "Aoi", "Ren", "Hina", "Yuto", "Sakura", "Kaito", "Mio"], l: ["Tanaka", "Sato", "Suzuki", "Takahashi", "Watanabe", "Yamamoto", "Nakamura", "Kobayashi"] },
  kr: { f: ["Min-jun", "Seo-yeon", "Ji-ho", "Ha-eun", "Do-yun", "Soo-ah", "Jun-seo", "Yu-na"], l: ["Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon"] },
  cn: { f: ["Wei", "Fang", "Hao", "Lin", "Jian", "Yan", "Lei", "Xin", "Chen", "Jing"], l: ["Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Huang", "Zhao", "Wu"] },
  au: { f: ["Jack", "Charlotte", "Noah", "Olivia", "William", "Ruby", "Ethan", "Zoe", "Hudson"], l: ["Walker", "Thompson", "Wright", "Patel", "Robinson", "Kelly", "Nguyen", "Cooper"] },
  tr: { f: ["Emre", "Elif", "Mert", "Zeynep", "Burak", "Ece", "Can", "Defne"], l: ["Yılmaz", "Demir", "Kaya", "Şahin", "Çelik", "Aydın", "Öztürk"] },
  ru: { f: ["Dmitri", "Anna", "Sergei", "Olga", "Ivan", "Ekaterina", "Mikhail", "Yulia"], l: ["Ivanov", "Petrov", "Volkov", "Sokolov", "Popov", "Morozova", "Novikov"] },
};

const LANGS = ["JavaScript", "TypeScript", "Python", "Rust", "Go", "C++", "Java", "Ruby", "Swift", "Kotlin", "PHP", "Elixir", "Haskell", "C#", "Scala", "Zig", "Lua", "Clojure"];
const FOCUS = ["Frontend", "Backend", "Full-stack", "Systems", "Machine Learning", "DevOps / SRE", "Mobile", "Gamedev", "Embedded", "Security", "Data Eng", "Compilers", "Graphics", "Blockchain"];
const STATUS = ["online", "online", "online", "away", "away", "offline"];
const TAGLINES = [
  "shipping in prod since forever", "ex-bigtech, now building solo", "open-source maintainer",
  "compiler nerd & coffee", "making the web weird again", "pixels & packets",
  "infra goblin", "type systems enjoyer", "tinkering with hardware",
  "late-night committer", "bug whisperer", "perf obsessive",
  "kernel hacker by night", "indie hacker", "turning caffeine into code",
  "side-project hoarder", "rewrites it in Rust", "vim, btw",
  "deploys on Fridays", "former QA, never again",
];
const HANDLE_SUFFIX = ["dev", "_codes", "x", "hq", "io", "exe", "dot", "lab", "_eth", "byte", "_", "00", "42", "zero"];

function makeHandle(first, last) {
  const base = (first.split(/[ -]/)[0] + (rand() < 0.5 ? last.split(/[ '-]/)[0] : "")).toLowerCase().replace(/[^a-z]/g, "");
  const suf = rand() < 0.6 ? pick(HANDLE_SUFFIX) : "";
  return "@" + base.slice(0, 10) + suf;
}

const developers = [];
let id = 0;
for (const [city, country, lat, lon, key, count] of CITIES) {
  for (let i = 0; i < count; i++) {
    const pool = NAMES[key] || NAMES.us;
    const first = pick(pool.f);
    const last = pick(pool.l);
    const langs = pickN(LANGS, 1 + Math.floor(rand() * 3));
    developers.push({
      id: id++,
      name: first + " " + last,
      handle: makeHandle(first, last),
      city, country,
      lat: jit(lat, 2.4),
      lon: jit(lon, 2.4),
      langs,
      focus: pick(FOCUS),
      years: 1 + Math.floor(rand() * 18),
      status: pick(STATUS),
      repos: Math.floor(rand() * 120) + 2,
      stars: Math.floor(rand() * rand() * 9000),
      tagline: pick(TAGLINES),
      avatar: Math.floor(rand() * 1e9),
    });
  }
}

// language totals for the filter bar
const langCounts = {};
for (const d of developers) for (const l of d.langs) langCounts[l] = (langCounts[l] || 0) + 1;
const topLangs = Object.keys(langCounts).sort((a, b) => langCounts[b] - langCounts[a]);

// country totals
const countryCounts = {};
for (const d of developers) countryCounts[d.country] = (countryCounts[d.country] || 0) + 1;

const DEVERSE_DATA = {
  developers,
  langCounts,
  topLangs,
  countryCounts,
  cities: CITIES.map((c) => ({ city: c[0], country: c[1], lat: c[2], lon: c[3] })),
  LANGS, FOCUS,
};

export default DEVERSE_DATA;
