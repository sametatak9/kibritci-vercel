const fs = require('fs');
const path = require('path');

const projectRoot = 'c:/Users/DELL/Desktop/Yeni klasör (2)';

function transformFile(fileName, replacements) {
  const filePath = path.join(projectRoot, 'src/components', fileName);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    return;
  }
  let content = fs.readFileSync(filePath, 'utf8');
  const originalLength = content.length;

  for (const [target, replacement] of replacements) {
    if (target instanceof RegExp) {
      content = content.replace(target, replacement);
    } else {
      content = content.split(target).join(replacement);
    }
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Transformed: ${fileName} (${originalLength} -> ${content.length} bytes)`);
}

// ==========================================
// 1. GuvenlikScreen.tsx
// ==========================================
const guvenlikReplacements = [
  // Main simulator check at toggle level
  [
    `const mainLayout = (\n    <div className="flex-1 overflow-hidden flex flex-col bg-slate-900 select-none">`,
    `const mainLayout = (\n    <div className="flex-1 overflow-hidden flex flex-col bg-slate-50 select-none">`
  ],
  [
    `      {/* 📱💻 Görünüm Simülatörü Kontrolü */}\n      <div className="bg-slate-955 border-b border-slate-855 p-2.5 px-6 flex justify-between items-center text-xs text-slate-300 shrink-0">`,
    `      {/* 📱💻 Görünüm Simülatörü Kontrolü */}\n      {!isStandalone && (\n        <div className="bg-white border-b border-slate-200 p-2.5 px-6 flex justify-between items-center text-xs text-slate-700 shrink-0">`
  ],
  [
    `      <div className="bg-slate-950 border-b border-slate-855 p-2.5 px-6 flex justify-between items-center text-xs text-slate-300 shrink-0">`,
    `      {!isStandalone && (\n        <div className="bg-white border-b border-slate-200 p-2.5 px-6 flex justify-between items-center text-xs text-slate-700 shrink-0">`
  ],
  [
    `      </div>\n      \n      {/* 🛡️ Header section */}`,
    `      </div>\n      )}\n      \n      {/* 🛡️ Header section */}`
  ],
  [
    `if (viewMode === 'mobile') {`,
    `if (!isStandalone && viewMode === 'mobile') {`
  ],
  // Theme updates
  // Header: bg-slate-955 -> bg-white
  [`<div className="bg-slate-955 p-5 px-6 border-b border-slate-800 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center shrink-0">`, `<div className="bg-white p-5 px-6 border-b border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center shrink-0">`],
  [`<div className="bg-slate-950 p-5 px-6 border-b border-slate-800 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center shrink-0">`, `<div className="bg-white p-5 px-6 border-b border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center shrink-0">`],
  // Title texts in header
  [`text-white tracking-widest uppercase">🚧 KİBRİTÇİ ŞANTİYE GÜVENLİK KAPISI`, `text-slate-850 tracking-widest uppercase">🚧 KİBRİTÇİ ŞANTİYE GÜVENLİK KAPISI`],
  [`text-slate-400 font-mono uppercase tracking-wider">İrsaliye Kayıt, Araç Kantarı, Misafir Defteri ve Personel Giriş Kapısı`, `text-slate-550 font-mono uppercase tracking-wider">İrsaliye Kayıt, Araç Kantarı, Misafir Defteri ve Personel Giriş Kapısı`],
  [`bg-slate-900 border border-slate-800 rounded-xl p-2 px-4 flex items-center space-x-3`, `bg-slate-50 border border-slate-200 rounded-xl p-2 px-4 flex items-center space-x-3`],
  [`text-slate-405 uppercase tracking-wider block">Giriş Noktası:`, `text-slate-500 uppercase tracking-wider block">Giriş Noktası:`],
  // Left menu panel
  [`w-full lg:w-72 bg-slate-955 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col p-4 space-y-4 shrink-0 lg:overflow-y-auto`, `w-full lg:w-72 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col p-4 space-y-4 shrink-0 lg:overflow-y-auto`],
  [`w-full lg:w-72 bg-slate-950 border-b lg:border-b-0 lg:border-r border-slate-800 flex flex-col p-4 space-y-4 shrink-0 lg:overflow-y-auto`, `w-full lg:w-72 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col p-4 space-y-4 shrink-0 lg:overflow-y-auto`],
  [`bg-slate-900/40 p-1.5 rounded-xl border border-slate-800`, `bg-slate-50 p-1.5 rounded-xl border border-slate-200`],
  [`text-slate-400 hover:bg-slate-900`, `text-slate-600 hover:bg-slate-100`],
  // Right side panel content cards
  [/bg-slate-950/g, 'bg-white'],
  [/border-slate-800/g, 'border-slate-200'],
  [/border-slate-850/g, 'border-slate-200'],
  [/bg-slate-900(?![\/\-\w])/g, 'bg-slate-50'],
  // Change inputs from bg-slate-900 to bg-white
  [/className="w-full bg-slate-900 border/g, 'className="w-full bg-white border border-slate-200'],
  [/className="w-full bg-slate-900 text-slate-200/g, 'className="w-full bg-white text-slate-800 border border-slate-200'],
  [/className="w-full bg-slate-900 text-slate-100/g, 'className="w-full bg-white text-slate-800 border border-slate-200'],
  // text colors
  [/text-slate-200/g, 'text-slate-805'],
  [/text-slate-300/g, 'text-slate-700'],
  [/text-slate-400/g, 'text-slate-500'],
  [/text-slate-100/g, 'text-slate-800'],
  // White text exceptions (like block headings)
  [`text-white uppercase tracking-widest block border-b`, `text-slate-805 uppercase tracking-widest block border-b`],
  [`text-white block">`, `text-slate-805 block">`],
  // Fix general layout container bg
  [`bg-slate-900 select-none`, `bg-slate-50 select-none`],
  [`bg-slate-900 p-6 overflow-y-auto space-y-6`, `bg-slate-50 p-6 overflow-y-auto space-y-6`],
  // Authorization lock screen (let's keep the authorization lock screen dark for contrast, or convert it too)
  [`bg-slate-950 flex flex-col items-center justify-center p-6 text-center`, `bg-slate-50 flex flex-col items-center justify-center p-6 text-center`],
  [`bg-slate-900 border border-slate-800 p-4 rounded-2xl flex flex-col space-y-2 text-xs font-mono w-full max-w-xs text-left mb-6`, `bg-white border border-slate-200 p-4 rounded-2xl flex flex-col space-y-2 text-xs font-mono w-full max-w-xs text-left mb-6`],
  [`text-slate-500">Kullanıcı:`, `text-slate-400">Kullanıcı:`],
  [`text-slate-305 font-bold`, `text-slate-700 font-bold`]
];

// ==========================================
// 2. KampciScreen.tsx
// ==========================================
const kampciReplacements = [
  // Interface update
  [
    `interface KampciScreenProps {\n  kampOdalari: KampOdasi[];\n  setKampOdalari: React.Dispatch<React.SetStateAction<KampOdasi[]>>;\n  kampKayitlari: KampKaydi[];\n  setKampKayitlari: React.Dispatch<React.SetStateAction<KampKaydi[]>>;\n  personeller: Personel[];\n  stokKartlar?: StokKart[];\n  currentUser: any;\n  onSignOut?: () => void;\n}`,
    `interface KampciScreenProps {\n  kampOdalari: KampOdasi[];\n  setKampOdalari: React.Dispatch<React.SetStateAction<KampOdasi[]>>;\n  kampKayitlari: KampKaydi[];\n  setKampKayitlari: React.Dispatch<React.SetStateAction<KampKaydi[]>>;\n  personeller: Personel[];\n  stokKartlar?: StokKart[];\n  currentUser: any;\n  onSignOut?: () => void;\n  isStandalone?: boolean;\n}`
  ],
  [
    `export const KampciScreen: React.FC<KampciScreenProps> = ({\n  kampOdalari,\n  setKampOdalari,\n  kampKayitlari,\n  setKampKayitlari,\n  personeller,\n  stokKartlar = [],\n  currentUser,\n  onSignOut\n}) => {`,
    `export const KampciScreen: React.FC<KampciScreenProps> = ({\n  kampOdalari,\n  setKampOdalari,\n  kampKayitlari,\n  setKampKayitlari,\n  personeller,\n  stokKartlar = [],\n  currentUser,\n  onSignOut,\n  isStandalone = false\n}) => {`
  ],
  // Return check for mobile mode
  [
    `if (viewMode === 'mobile') {`,
    `if (!isStandalone && viewMode === 'mobile') {`
  ],
  // Return check for standalone mode
  [
    `return (\n    <div className="flex-grow h-full overflow-y-auto bg-slate-900 text-slate-100 font-sans p-4 md:p-6 space-y-6">`,
    `if (isStandalone) {\n    return (\n      <div className="w-full h-full overflow-y-auto bg-slate-50 text-slate-800 font-sans p-4 space-y-6">\n        {content}\n      </div>\n    );\n  }\n\n  return (\n    <div className="flex-grow h-full overflow-y-auto bg-slate-50 text-slate-800 font-sans p-4 md:p-6 space-y-6">`
  ],
  // View mode switcher on web view
  [
    `<div className="flex items-center justify-between bg-slate-950 border border-slate-800 rounded-xl p-3.5 shadow-lg">`,
    `<div className="flex items-center justify-between bg-white border border-slate-200 rounded-xl p-3.5 shadow-md">`
  ],
  [
    `<span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md uppercase font-black">💻 Web Sürüm</span>`,
    `<span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md uppercase font-black">💻 Web Sürüm</span>`
  ],
  // General colors inside content
  [`text-white mt-1">⛺ KAMP AMİRLİĞİ MOBİL PANELİ`, `text-slate-800 mt-1">⛺ KAMP AMİRLİĞİ MOBİL PANELİ`],
  [`bg-slate-955 border border-slate-800 rounded-xl px-4 py-2`, `bg-white border border-slate-200 rounded-xl px-4 py-2`],
  [`border-b border-slate-800 pb-5`, `border-b border-slate-200 pb-5`],
  [`border-b border-slate-800 pb-1`, `border-b border-slate-200 pb-1`],
  [`bg-slate-955 border-slate-800/80 text-slate-400 hover:bg-slate-900`, `bg-white border-slate-200 text-slate-600 hover:bg-slate-50`],
  [/bg-slate-950/g, 'bg-white'],
  [/border-slate-800/g, 'border-slate-200'],
  [/bg-slate-900(?![\/\-\w])/g, 'bg-slate-50'],
  [/text-slate-100/g, 'text-slate-800'],
  [/text-slate-200/g, 'text-slate-700'],
  [/text-slate-350/g, 'text-slate-600'],
  [/text-slate-400/g, 'text-slate-500'],
  // input elements
  [/className="w-full bg-slate-900 border border-slate-800/g, 'className="w-full bg-white border border-slate-200'],
  [/className="w-full bg-slate-900 border border-slate-800\/80/g, 'className="w-full bg-white border border-slate-200'],
  [/className="w-full bg-slate-900 text-white/g, 'className="w-full bg-white text-slate-800 border border-slate-200'],
  [/className="w-full bg-slate-900 text-slate-150/g, 'className="w-full bg-white text-slate-800 border border-slate-200'],
];

// ==========================================
// 3. EvrakAktarimiScreen.tsx
// ==========================================
const evrakReplacements = [
  // Background container
  [
    `<div className="flex-grow p-6 bg-[#0b0f19] text-gray-200 select-none overflow-y-auto min-h-full">`,
    `<div className="flex-grow p-6 bg-slate-50 text-slate-700 select-none overflow-y-auto min-h-full">`
  ],
  // Header banner: bg-gradient-to-r from-blue-900/30 to-indigo-950/20 border border-blue-500/15
  [
    `bg-gradient-to-r from-blue-900/30 to-indigo-950/20 border border-blue-500/15`,
    `bg-gradient-to-r from-blue-50 to-indigo-50/50 border border-blue-200`
  ],
  [
    `h1 className="font-display font-black text-xl text-white tracking-tight uppercase leading-none"`,
    `h1 className="font-display font-black text-xl text-slate-850 tracking-tight uppercase leading-none"`
  ],
  // Cards: bg-[#111827] border border-[#1f2937]
  [
    `bg-[#111827] border border-[#1f2937]`,
    `bg-white border border-slate-200 shadow-sm`
  ],
  // File upload area
  [
    `border-[#374151] hover:border-slate-600 bg-slate-950`,
    `border-slate-200 hover:border-slate-400 bg-slate-50`
  ],
  [
    `w-12 h-12 bg-[#1e293b] rounded-full`,
    `w-12 h-12 bg-white border border-slate-200 rounded-full`
  ],
  [
    `text-slate-200">\n                    Sürükleyip Bırakın veya`,
    `text-slate-700">\n                    Sürükleyip Bırakın veya`
  ],
  // docType button active/inactive states
  [
    `bg-blue-600/10 border-blue-500 text-white font-semibold`,
    `bg-blue-50 border-blue-400 text-blue-700 font-semibold shadow-xs`
  ],
  [
    `bg-slate-950 border-[#1f2937] hover:border-slate-800 text-slate-400`,
    `bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-600`
  ],
  // general replacements for inputs inside EvrakAktarimiScreen
  [/bg-slate-955/g, 'bg-slate-50'],
  [/bg-slate-950/g, 'bg-slate-50'],
  [/bg-slate-900/g, 'bg-slate-50'],
  [/border-slate-800/g, 'border-slate-200'],
  [/text-white/g, 'text-slate-800'],
  [/text-slate-400/g, 'text-slate-500'],
];

// Perform transformations
transformFile('GuvenlikScreen.tsx', guvenlikReplacements);
transformFile('KampciScreen.tsx', kampciReplacements);
transformFile('EvrakAktarimiScreen.tsx', evrakReplacements);
