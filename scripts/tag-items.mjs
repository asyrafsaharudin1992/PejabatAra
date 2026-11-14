// Fills the active ingredient(s) and the drug-class categories of the medicines in proc_items from their name and description (Plato has neither).
// Usage: node scripts/tag-items.mjs [--apply]   (dry run by default). Items the CPO has edited by hand are left alone; items tagged here are marked tags_auto
// so they can be checked, and a re-run only refreshes those. Needs the tags_auto column (migration 202611140003).
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';

const apply = process.argv.includes('--apply');
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const hit = line.match(/^([A-Z_]+)=(.*)$/); if (hit && !process.env[hit[1]]) process.env[hit[1]] = hit[2].replace(/^["']|["']$/g, ''); }
const db = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }, realtime: { transport: WebSocket } });

// generic name | other spellings or common abbreviations | classes
const DRUGS = `
Paracetamol|pcm,acetaminophen|Analgesic;Antipyretic
Ibuprofen||NSAID;Analgesic
Diclofenac||NSAID;Analgesic
Mefenamic acid||NSAID;Analgesic
Naproxen||NSAID;Analgesic
Ketoprofen||NSAID;Analgesic
Flurbiprofen||NSAID;Analgesic
Celecoxib||NSAID;Analgesic
Etoricoxib||NSAID;Analgesic
Aspirin|acetylsalicylic acid|Antiplatelet;Analgesic
Tramadol||Opioid analgesic
Orphenadrine||Muscle relaxant
Tizanidine||Muscle relaxant
Methocarbamol||Muscle relaxant
Eperisone||Muscle relaxant
Pregabalin||Neuropathic pain
Gabapentin||Neuropathic pain
Colchicine||Gout
Allopurinol||Gout
Febuxostat||Gout
Amoxicillin||Antibiotic;Penicillin
Clavulanic acid|clavulanate,augmentin|Antibiotic;Penicillin
Cloxacillin||Antibiotic;Penicillin
Penicillin V|phenoxymethylpenicillin|Antibiotic;Penicillin
Cefuroxime|zinnat|Antibiotic;Cephalosporin
Cephalexin|keflex|Antibiotic;Cephalosporin
Cefalexin||Antibiotic;Cephalosporin
Cefixime||Antibiotic;Cephalosporin
Cefpodoxime||Antibiotic;Cephalosporin
Cefdinir||Antibiotic;Cephalosporin
Ceftriaxone|rocephin|Antibiotic;Cephalosporin
Azithromycin||Antibiotic;Macrolide
Clarithromycin||Antibiotic;Macrolide
Erythromycin||Antibiotic;Macrolide
Ciprofloxacin||Antibiotic;Fluoroquinolone
Levofloxacin||Antibiotic;Fluoroquinolone
Ofloxacin||Antibiotic;Fluoroquinolone
Doxycycline||Antibiotic;Tetracycline
Metronidazole||Antibiotic;Antiprotozoal
Cotrimoxazole|co-trimoxazole,sulfamethoxazole,trimethoprim|Antibiotic
Nitrofurantoin||Antibiotic
Fusidic acid||Antibiotic;Topical antibiotic
Mupirocin||Antibiotic;Topical antibiotic
Neomycin||Antibiotic;Topical antibiotic
Gentamicin||Antibiotic
Chloramphenicol||Antibiotic
Clindamycin||Antibiotic
Acyclovir|aciclovir|Antiviral
Valacyclovir|valaciclovir|Antiviral
Oseltamivir||Antiviral
Fluconazole||Antifungal
Clotrimazole||Antifungal
Miconazole||Antifungal
Ketoconazole||Antifungal
Terbinafine||Antifungal
Nystatin||Antifungal
Albendazole||Anthelmintic
Mebendazole||Anthelmintic
Ivermectin||Anthelmintic
Cetirizine||Antihistamine
Levocetirizine||Antihistamine
Loratadine||Antihistamine
Desloratadine||Antihistamine
Fexofenadine||Antihistamine
Chlorpheniramine|chlorphenamine,cpm|Antihistamine
Dexchlorpheniramine||Antihistamine
Triprolidine||Antihistamine
Diphenhydramine||Antihistamine
Promethazine||Antihistamine
Hydroxyzine||Antihistamine
Dimenhydrinate||Antiemetic;Antihistamine
Pseudoephedrine||Decongestant
Phenylephrine||Decongestant
Oxymetazoline||Decongestant
Xylometazoline||Decongestant
Dextromethorphan|dextrophan|Antitussive
Codeine||Antitussive
Bromhexine||Mucolytic
Ambroxol||Mucolytic
Acetylcysteine||Mucolytic
Carbocysteine||Mucolytic
Guaiphenesin|guaifenesin|Expectorant
Salbutamol|ventolin|Bronchodilator;SABA
Levosalbutamol|levalbuterol|Bronchodilator;SABA
Indacaterol||Bronchodilator;LABA
Glycopyrronium||Bronchodilator
Tiotropium||Bronchodilator
Terbutaline||Bronchodilator;SABA
Ipratropium||Bronchodilator
Salmeterol||Bronchodilator;LABA
Formoterol|formeterol|Bronchodilator;LABA
Fluticasone||Corticosteroid;Inhaled steroid
Budesonide||Corticosteroid;Inhaled steroid
Beclometasone|beclomethasone|Corticosteroid;Inhaled steroid
Montelukast||Asthma controller
Theophylline||Bronchodilator
Prednisolone||Corticosteroid
Dexamethasone||Corticosteroid
Hydrocortisone||Corticosteroid
Betamethasone||Corticosteroid
Mometasone||Corticosteroid
Triamcinolone||Corticosteroid
Clobetasol||Corticosteroid
Methylprednisolone||Corticosteroid
Amlodipine||Antihypertensive;Calcium channel blocker
Nifedipine||Antihypertensive;Calcium channel blocker
Felodipine||Antihypertensive;Calcium channel blocker
Telmisartan||Antihypertensive;ARB
Valsartan||Antihypertensive;ARB
Losartan||Antihypertensive;ARB
Irbesartan||Antihypertensive;ARB
Candesartan||Antihypertensive;ARB
Perindopril||Antihypertensive;ACE inhibitor
Enalapril||Antihypertensive;ACE inhibitor
Lisinopril||Antihypertensive;ACE inhibitor
Ramipril||Antihypertensive;ACE inhibitor
Captopril||Antihypertensive;ACE inhibitor
Bisoprolol||Antihypertensive;Beta blocker
Atenolol||Antihypertensive;Beta blocker
Metoprolol||Antihypertensive;Beta blocker
Propranolol||Antihypertensive;Beta blocker
Carvedilol||Antihypertensive;Beta blocker
Hydrochlorothiazide|hctz|Antihypertensive;Diuretic
Indapamide||Antihypertensive;Diuretic
Furosemide||Diuretic
Spironolactone||Diuretic
Atorvastatin||Statin;Anti-cholesterol
Rosuvastatin|crestor|Statin;Anti-cholesterol
Simvastatin||Statin;Anti-cholesterol
Fenofibrate||Anti-cholesterol
Ezetimibe||Anti-cholesterol
Clopidogrel||Antiplatelet
Metformin||Anti-diabetic;Biguanide
Gliclazide||Anti-diabetic;Sulphonylurea
Glimepiride||Anti-diabetic;Sulphonylurea
Glibenclamide||Anti-diabetic;Sulphonylurea
Sitagliptin||Anti-diabetic;DPP-4 inhibitor
Linagliptin||Anti-diabetic;DPP-4 inhibitor
Vildagliptin||Anti-diabetic;DPP-4 inhibitor
Empagliflozin||Anti-diabetic;SGLT2 inhibitor
Dapagliflozin||Anti-diabetic;SGLT2 inhibitor
Semaglutide||Anti-diabetic;GLP-1 agonist
Tirzepatide||Anti-diabetic;GLP-1 agonist
Pioglitazone||Anti-diabetic
Insulin||Anti-diabetic;Insulin
Levothyroxine||Thyroid
Omeprazole||Anti-gastric;PPI
Esomeprazole||Anti-gastric;PPI
Pantoprazole||Anti-gastric;PPI
Lansoprazole||Anti-gastric;PPI
Famotidine||Anti-gastric;H2 blocker
Ranitidine||Anti-gastric;H2 blocker
Sucralfate||Anti-gastric
Simethicone||Antiflatulent
Dicyclomine||Antispasmodic
Hyoscine|buscopan,butylbromide|Antispasmodic
Mebeverine||Antispasmodic
Metoclopramide||Antiemetic
Domperidone||Antiemetic
Ondansetron||Antiemetic
Loperamide||Antidiarrhoeal
Racecadotril||Antidiarrhoeal
Smectite||Antidiarrhoeal
Lactulose||Laxative
Bisacodyl||Laxative
Aluminium hydroxide|al(oh)3|Antacid
Magnesium hydroxide|mg(oh)2|Antacid
Calcium carbonate||Antacid;Supplement
Sodium bicarbonate||Antacid
Tamsulosin||BPH
Dutasteride||BPH
Finasteride||BPH
Tadalafil||Erectile dysfunction
Sildenafil||Erectile dysfunction
Tranexamic acid||Haemostatic
Norethisterone||Hormonal therapy
Dydrogesterone||Hormonal therapy
Betahistine||Vertigo
Cinnarizine||Vertigo
Diosmin||Haemorrhoid
Folic acid||Supplement;Vitamin
Ferrous fumarate||Supplement;Iron
Methylcobalamin||Supplement;Vitamin
Pyridoxine||Supplement;Vitamin
Vitamin C|ascorbic acid|Supplement;Vitamin
Vitamin D|cholecalciferol|Supplement;Vitamin
Zinc||Supplement
Salicylic acid||Keratolytic
Calamine||Soothing topical
Povidone-iodine|betadine|Antiseptic
Chlorhexidine||Antiseptic
Hyaluronic acid||Mucosal protectant
Lignocaine|lidocaine|Local anaesthetic
Ketorolac||NSAID;Analgesic
Adrenaline|epinephrine|Emergency
Atropine||Emergency
Diazepam||Sedative
Lorazepam||Sedative
Alprazolam||Sedative
Amitriptyline||Antidepressant
Escitalopram||Antidepressant
Sertraline||Antidepressant
`.trim().split('\n').map((line) => { const [name, aliases, classes] = line.split('|'); return { name, terms: [name, ...(aliases ? aliases.split(',') : [])].map((t) => t.toLowerCase()), classes: classes.split(';') }; });
// Extra drug classes named in the description (for brands that give no generic name).
const WORDS = [['antibiotic', 'Antibiotic'], ['antihistamine', 'Antihistamine'], ['decongestant', 'Decongestant'], ['antitussive', 'Antitussive'], ['expectorant', 'Expectorant'], ['mucolytic', 'Mucolytic'], ['nsaid', 'NSAID'], ['steroid', 'Corticosteroid'], ['antiviral', 'Antiviral'], ['antifungal', 'Antifungal'], ['antacid', 'Antacid'], ['antiemetic', 'Antiemetic'], ['antispasmodic', 'Antispasmodic'], ['antiflatulent', 'Antiflatulent'], ['statin', 'Statin'], ['laxative', 'Laxative'], ['probiotic', 'Probiotic'], ['vitamin', 'Vitamin'], ['antiseptic', 'Antiseptic'], ['muscle relaxant', 'Muscle relaxant'], ['hypertension', 'Antihypertensive'], ['asthma', 'Asthma controller'], ['diabetes', 'Anti-diabetic']];
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matcher = (term) => new RegExp(`(^|[^a-z])${escape(term)}([^a-z]|$)`, 'i');
for (const drug of DRUGS) drug.tests = drug.terms.map(matcher);
const TYPES = new Set(['Medicine', 'Injection', 'Vaccination']);

const rows = [];
for (let from = 0; ; from += 1000) { const { data, error } = await db.from('proc_items').select('plato_id,type,category,name,description,categories,ingredients,tags_auto').range(from, from + 999); if (error) { console.error(error.message); process.exit(1); } rows.push(...data); if (data.length < 1000) break; }

const updates = []; let skippedManual = 0, noMatch = 0;
for (const row of rows) {
  if (!TYPES.has(row.type)) continue;
  if ((row.ingredients?.length || row.categories?.some((c) => c !== row.category)) && !row.tags_auto) { skippedManual += 1; continue; }
  const text = `${row.name} ${row.description || ''}`;
  const hits = DRUGS.filter((drug) => drug.tests.some((test) => test.test(text)));
  const ingredients = row.type === 'Vaccination' ? [] : hits.map((drug) => drug.name);
  const own = String(row.category || '').split(',').map((part) => part.trim()).filter(Boolean);
  const classes = [...new Set(hits.flatMap((drug) => drug.classes))];
  const wordClasses = WORDS.filter(([word]) => new RegExp(`(^|[^a-z])${escape(word)}`, 'i').test(row.description || '')).map(([, label]) => label);
  const categories = [...new Set([...own, ...classes, ...(classes.length ? [] : wordClasses)])].slice(0, 12);
  if (!ingredients.length && categories.length <= own.length) { noMatch += 1; continue; }
  updates.push({ plato_id: row.plato_id, name: row.name, categories, ingredients: ingredients.slice(0, 12) });
}
console.log(`Medicines, injections and vaccines: ${rows.filter((row) => TYPES.has(row.type)).length}\nTo tag: ${updates.length} (with an ingredient: ${updates.filter((u) => u.ingredients.length).length}) · no match: ${noMatch} · left alone (edited by hand): ${skippedManual}`);
for (const sample of updates.filter((u) => process.env.SHOW ? new RegExp(process.env.SHOW, 'i').test(u.name) : Math.random() < 0.04).slice(0, process.env.SHOW ? 40 : 14)) console.log(`  ${sample.name.slice(0, 60)} → ${sample.ingredients.join(' + ') || '—'} | ${sample.categories.join(', ')}`);
if (!apply) { console.log('Dry run only. Add --apply to write.'); process.exit(0); }
for (const update of updates) { const { error } = await db.from('proc_items').update({ categories: update.categories, ingredients: update.ingredients, tags_auto: true }).eq('plato_id', update.plato_id); if (error) { console.error(update.plato_id, error.message); process.exit(1); } }
console.log(`Saved ${updates.length} items.`);
