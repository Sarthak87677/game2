/**
 * Maharashtra cities, towns, hill stations and Konkan coast places.
 *
 * DATA NOTE — every coordinate here is an APPROXIMATE public reference value written from memory (typically within a
 * few hundred metres of the town centre). Nothing is surveyed by this project; every entry carries a `dataNote`.
 */
import { defineDestinations } from './defineDestination';
import type { Destination } from './types';

/** The 16 urban regions named in the Maharashtra plan, in plan order. */
export const URBAN_REGION_IDS = [
  'mumbai', 'navi-mumbai', 'thane', 'pune', 'pimpri-chinchwad', 'nagpur', 'nashik', 'kolhapur', 'sangli', 'satara', 'solapur',
  'chhatrapati-sambhajinagar', 'amravati', 'nanded', 'jalgaon', 'akola',
] as const;

export const MAHARASHTRA_CITIES: Destination[] = defineDestinations([
  // ───────────── The 16 urban regions ─────────────
  { id: 'mumbai', name: 'Mumbai', kind: 'city', district: 'Mumbai City', lat: 19.0760, lon: 72.8777, description: 'State capital and India’s largest city: a dense peninsula of towers, mills and chawls between Back Bay and the harbour.', tags: ['bombay', 'capital', 'financial capital'], overviewHeightM: 4000 },
  { id: 'navi-mumbai', name: 'Navi Mumbai', kind: 'city', district: 'Thane', lat: 19.0330, lon: 73.0297, description: 'Planned twin city across Thane Creek with Vashi, Belapur, Kharghar and Panvel nodes.', tags: ['new bombay', 'vashi', 'belapur', 'kharghar'] },
  { id: 'thane', name: 'Thane', kind: 'city', district: 'Thane', lat: 19.2183, lon: 72.9781, description: 'City of lakes on Thane Creek at the head of the suburban rail lines.', tags: ['thana', 'city of lakes'] },
  { id: 'pune', name: 'Pune', kind: 'city', district: 'Pune', lat: 18.5204, lon: 73.8567, description: 'Cultural capital of Maharashtra on the Deccan plateau: Peshwa-era old city, universities and IT parks.', tags: ['poona', 'oxford of the east'], overviewHeightM: 3500 },
  { id: 'pimpri-chinchwad', name: 'Pimpri-Chinchwad', kind: 'city', district: 'Pune', lat: 18.6298, lon: 73.7997, description: 'Industrial twin city north-west of Pune along the Mumbai–Pune corridor.', tags: ['pcmc', 'pimpri', 'chinchwad', 'industrial'] },
  { id: 'nagpur', name: 'Nagpur', kind: 'city', district: 'Nagpur', lat: 21.1458, lon: 79.0882, description: 'Orange city at the geographic centre of India and winter capital of the state.', tags: ['orange city', 'vidarbha', 'winter capital'] },
  { id: 'nashik', name: 'Nashik', kind: 'city', district: 'Nashik', lat: 19.9975, lon: 73.7898, description: 'Kumbh Mela city on the Godavari, ringed by vineyards and Sahyadri hills.', tags: ['nasik', 'godavari', 'wine'] },
  { id: 'kolhapur', name: 'Kolhapur', kind: 'city', district: 'Kolhapur', lat: 16.7050, lon: 74.2433, description: 'Historic princely city on the Panchganga, famous for its Mahalaxmi temple, wrestling and leather chappals.', tags: ['karvir', 'panchganga'] },
  { id: 'sangli', name: 'Sangli', kind: 'city', district: 'Sangli', lat: 16.8524, lon: 74.5815, description: 'Turmeric-trading city on the Krishna river, twinned with Miraj.', tags: ['miraj', 'krishna river', 'turmeric'] },
  { id: 'satara', name: 'Satara', kind: 'city', district: 'Satara', lat: 17.6805, lon: 74.0183, description: 'Maratha capital town below Ajinkyatara fort, gateway to the Kaas plateau.', tags: ['ajinkyatara'] },
  { id: 'solapur', name: 'Solapur', kind: 'city', district: 'Solapur', lat: 17.6599, lon: 75.9064, description: 'Textile city of the Deccan plain near the Karnataka border.', tags: ['sholapur', 'textiles', 'chaddar'] },
  { id: 'chhatrapati-sambhajinagar', name: 'Chhatrapati Sambhajinagar', kind: 'city', district: 'Chhatrapati Sambhajinagar', lat: 19.8762, lon: 75.3433, description: 'Gateway to Ajanta and Ellora, formerly Aurangabad, with Mughal gardens and gates.', tags: ['aurangabad', 'marathwada', 'city of gates'] },
  { id: 'amravati', name: 'Amravati', kind: 'city', district: 'Amravati', lat: 20.9320, lon: 77.7523, description: 'Cotton-belt city of Vidarbha below the Melghat hills.', tags: ['amraoti', 'vidarbha'] },
  { id: 'nanded', name: 'Nanded', kind: 'city', district: 'Nanded', lat: 19.1383, lon: 77.3210, description: 'Godavari-side city and Sikh pilgrimage centre of Marathwada.', tags: ['marathwada', 'godavari'] },
  { id: 'jalgaon', name: 'Jalgaon', kind: 'city', district: 'Jalgaon', lat: 21.0077, lon: 75.5626, description: 'Banana-belt city of Khandesh on the Tapi plain.', tags: ['khandesh', 'banana city'] },
  { id: 'akola', name: 'Akola', kind: 'city', district: 'Akola', lat: 20.7002, lon: 77.0082, description: 'Cotton city of western Vidarbha on the Morna river.', tags: ['vidarbha'] },

  // ───────────── Hill stations ─────────────
  { id: 'mahabaleshwar', name: 'Mahabaleshwar', kind: 'hill-station', district: 'Satara', lat: 17.9237, lon: 73.6586, description: 'Highest hill station of the Western Ghats, with strawberry farms, viewpoints and the source of the Krishna.', tags: ['strawberries', 'western ghats', 'sahyadri'] },
  { id: 'lonavala', name: 'Lonavala', kind: 'hill-station', district: 'Pune', lat: 18.7546, lon: 73.4062, description: 'Monsoon hill station on the Mumbai–Pune ghat, known for chikki and waterfalls.', tags: ['lonavla', 'chikki', 'bhor ghat'] },
  { id: 'khandala', name: 'Khandala', kind: 'hill-station', district: 'Pune', lat: 18.7481, lon: 73.3733, description: 'Twin of Lonavala at the top of the Bhor Ghat, overlooking the Konkan valley.', tags: ['bhor ghat', 'duke’s nose'] },
  { id: 'matheran', name: 'Matheran', kind: 'hill-station', district: 'Raigad', lat: 18.9866, lon: 73.2683, description: 'Car-free hill station on a forested plateau reached by a narrow-gauge toy train.', tags: ['toy train', 'car free', 'neral'] },
  { id: 'panchgani', name: 'Panchgani', kind: 'hill-station', district: 'Satara', lat: 17.9244, lon: 73.8000, description: 'Tableland hill station of five hills between Mahabaleshwar and Wai.', tags: ['table land', 'five hills'] },
  { id: 'chikhaldara', name: 'Chikhaldara', kind: 'hill-station', district: 'Amravati', lat: 21.4067, lon: 77.3231, description: 'Vidarbha’s only hill station, a coffee-growing plateau in the Melghat hills.', tags: ['melghat', 'vidarbha', 'coffee'] },

  // ───────────── Konkan coast ─────────────
  { id: 'alibaug', name: 'Alibaug', kind: 'coast', district: 'Raigad', lat: 18.6414, lon: 72.8722, description: 'Beach town across the harbour from Mumbai with the sea fort of Kolaba offshore.', tags: ['alibag', 'beach', 'konkan'] },
  { id: 'murud-janjira', name: 'Murud-Janjira', kind: 'coast', district: 'Raigad', lat: 18.3282, lon: 72.9636, description: 'Coastal town facing the island fortress of Janjira.', tags: ['murud', 'janjira', 'konkan'] },
  { id: 'dapoli', name: 'Dapoli', kind: 'coast', district: 'Ratnagiri', lat: 17.7590, lon: 73.1870, description: 'Hilltop town above the Konkan beaches of Karde, Murud and Ladghar.', tags: ['karde', 'ladghar', 'konkan'] },
  { id: 'ganpatipule', name: 'Ganpatipule', kind: 'coast', district: 'Ratnagiri', lat: 17.1461, lon: 73.2653, description: 'White-sand beach and hillside Ganesh temple on the Ratnagiri coast.', tags: ['beach', 'ganesh', 'konkan'] },
  { id: 'ratnagiri', name: 'Ratnagiri', kind: 'coast', district: 'Ratnagiri', lat: 16.9902, lon: 73.3120, description: 'Alphonso-mango port town of the central Konkan.', tags: ['alphonso', 'hapus', 'port', 'konkan'] },
  { id: 'malvan-tarkarli', name: 'Malvan and Tarkarli', kind: 'coast', district: 'Sindhudurg', lat: 16.0594, lon: 73.4678, description: 'Fishing town of Malvan and the clear-water Tarkarli beach, base for Sindhudurg fort and snorkelling.', tags: ['malvan', 'tarkarli', 'scuba', 'konkan'] },
  { id: 'vengurla', name: 'Vengurla', kind: 'coast', district: 'Sindhudurg', lat: 15.8617, lon: 73.6318, description: 'Southernmost Konkan port town with cashew orchards and rocky headlands.', tags: ['konkan', 'cashew'] },
  { id: 'harihareshwar', name: 'Harihareshwar', kind: 'coast', district: 'Raigad', lat: 17.9950, lon: 73.0170, description: 'Temple beach at the mouth of the Savitri river, "the Kashi of the south".', tags: ['beach', 'konkan'] },
  { id: 'diveagar', name: 'Diveagar', kind: 'coast', district: 'Raigad', lat: 18.1720, lon: 72.9880, description: 'Quiet casuarina-lined beach village of the Raigad coast.', tags: ['beach', 'konkan'] },
  { id: 'kashid', name: 'Kashid beach', kind: 'coast', district: 'Raigad', lat: 18.4400, lon: 72.9100, description: 'Long white beach between Alibaug and Murud.', tags: ['beach', 'konkan'] },
  { id: 'guhagar', name: 'Guhagar', kind: 'coast', district: 'Ratnagiri', lat: 17.4830, lon: 73.1900, description: 'Coconut-palm beach town of the Ratnagiri coast.', tags: ['beach', 'konkan'] },
  { id: 'devgad', name: 'Devgad', kind: 'coast', district: 'Sindhudurg', lat: 16.3770, lon: 73.3800, description: 'Alphonso-orchard harbour town with a small sea fort and windmills.', tags: ['alphonso', 'konkan'] },

  // ───────────── District towns and other places ─────────────
  { id: 'latur', name: 'Latur', kind: 'town', district: 'Latur', lat: 18.4088, lon: 76.5604, description: 'Education and soybean-trading town of Marathwada.', tags: ['marathwada'] },
  { id: 'dhule', name: 'Dhule', kind: 'town', district: 'Dhule', lat: 20.9042, lon: 74.7749, description: 'Khandesh town on the Panjhra river at the crossing of two national highways.', tags: ['khandesh'] },
  { id: 'ahilyanagar', name: 'Ahilyanagar (Ahmednagar)', kind: 'town', district: 'Ahilyanagar', lat: 19.0948, lon: 74.7480, description: 'Sugar-belt town with a circular medieval fort, formerly Ahmednagar.', tags: ['ahmednagar', 'nagar'] },
  { id: 'chandrapur', name: 'Chandrapur', kind: 'town', district: 'Chandrapur', lat: 19.9615, lon: 79.2961, description: 'Coal and power town of eastern Vidarbha, gateway to Tadoba.', tags: ['chanda', 'vidarbha'] },
  { id: 'parbhani', name: 'Parbhani', kind: 'town', district: 'Parbhani', lat: 19.2704, lon: 76.7601, description: 'Agricultural university town of central Marathwada.', tags: ['marathwada'] },
  { id: 'jalna', name: 'Jalna', kind: 'town', district: 'Jalna', lat: 19.8347, lon: 75.8816, description: 'Seed and steel-rolling town east of Chhatrapati Sambhajinagar.', tags: ['marathwada'] },
  { id: 'beed', name: 'Beed', kind: 'town', district: 'Beed', lat: 18.9891, lon: 75.7601, description: 'Marathwada town on the Bindusara river below the Balaghat range.', tags: ['bid', 'marathwada'] },
  { id: 'dharashiv', name: 'Dharashiv (Osmanabad)', kind: 'town', district: 'Dharashiv', lat: 18.1860, lon: 76.0419, description: 'Marathwada town near the Tuljapur temple, formerly Osmanabad.', tags: ['osmanabad', 'marathwada'] },
  { id: 'wardha', name: 'Wardha', kind: 'town', district: 'Wardha', lat: 20.7453, lon: 78.6022, description: 'Cotton town of Vidarbha beside Gandhi’s Sevagram ashram.', tags: ['vidarbha', 'sevagram'] },
  { id: 'gondia', name: 'Gondia', kind: 'town', district: 'Gondia', lat: 21.4624, lon: 80.1961, description: 'Rice-bowl town on the eastern edge of the state.', tags: ['vidarbha', 'rice city'] },
  { id: 'yavatmal', name: 'Yavatmal', kind: 'town', district: 'Yavatmal', lat: 20.3888, lon: 78.1204, description: 'Cotton-growing plateau town of southern Vidarbha.', tags: ['yeotmal', 'vidarbha'] },
  { id: 'bhandara', name: 'Bhandara', kind: 'town', district: 'Bhandara', lat: 21.1704, lon: 79.6522, description: 'Brass-work town on the Wainganga east of Nagpur.', tags: ['vidarbha', 'brass'] },
  { id: 'buldhana', name: 'Buldhana', kind: 'town', district: 'Buldhana', lat: 20.5293, lon: 76.1842, description: 'Ajanta-range plateau town near Lonar crater and Shegaon.', tags: ['vidarbha'] },
  { id: 'hingoli', name: 'Hingoli', kind: 'town', district: 'Hingoli', lat: 19.7173, lon: 77.1494, description: 'Small Marathwada town near the Aundha Nagnath temple.', tags: ['marathwada'] },
  { id: 'washim', name: 'Washim', kind: 'town', district: 'Washim', lat: 20.1113, lon: 77.1330, description: 'Ancient Vatsagulma, a small Vidarbha town of temples and lakes.', tags: ['vidarbha'] },
  { id: 'gadchiroli', name: 'Gadchiroli', kind: 'town', district: 'Gadchiroli', lat: 20.1809, lon: 80.0037, description: 'Forested tribal district town in the far east of the state.', tags: ['vidarbha', 'forest'] },
  { id: 'palghar', name: 'Palghar', kind: 'town', district: 'Palghar', lat: 19.6967, lon: 72.7655, description: 'Coastal district town north of Mumbai on the Western Railway.', tags: ['konkan'] },
  { id: 'ichalkaranji', name: 'Ichalkaranji', kind: 'town', district: 'Kolhapur', lat: 16.6910, lon: 74.4600, description: 'Powerloom textile town east of Kolhapur, "the Manchester of Maharashtra".', tags: ['textiles', 'powerloom'] },
  { id: 'baramati', name: 'Baramati', kind: 'town', district: 'Pune', lat: 18.1515, lon: 74.5774, description: 'Sugar and agro-industry town of eastern Pune district.', tags: ['sugar'] },
  { id: 'karad', name: 'Karad', kind: 'town', district: 'Satara', lat: 17.2890, lon: 74.1820, description: 'Town at the confluence of the Krishna and Koyna rivers.', tags: ['preeti sangam', 'krishna', 'koyna'] },
  { id: 'pandharpur', name: 'Pandharpur', kind: 'town', district: 'Solapur', lat: 17.6792, lon: 75.3320, description: 'Pilgrim town on the Bhima (Chandrabhaga) river, destination of the Wari.', tags: ['wari', 'vitthal', 'chandrabhaga'] },
  { id: 'wai', name: 'Wai', kind: 'town', district: 'Satara', lat: 17.9527, lon: 73.8900, description: 'Krishna-side temple town of ghats below Panchgani, "Dakshin Kashi".', tags: ['ghats', 'krishna'] },
  { id: 'chiplun', name: 'Chiplun', kind: 'town', district: 'Ratnagiri', lat: 17.5300, lon: 73.5200, description: 'Konkan town on the Vashishti river below the Kumbharli ghat.', tags: ['konkan', 'vashishti'] },
  { id: 'sawantwadi', name: 'Sawantwadi', kind: 'town', district: 'Sindhudurg', lat: 15.9040, lon: 73.8210, description: 'Former princely town known for wooden toys and Ganjifa cards, beside Moti lake.', tags: ['konkan', 'wooden toys'] },
  { id: 'igatpuri', name: 'Igatpuri', kind: 'town', district: 'Nashik', lat: 19.6950, lon: 73.5620, description: 'Monsoon-lashed railway town at the top of the Thal ghat, below Kalsubai.', tags: ['thal ghat', 'monsoon'] },
  { id: 'panvel', name: 'Panvel', kind: 'town', district: 'Raigad', lat: 18.9894, lon: 73.1175, description: 'Junction town at the eastern edge of Navi Mumbai, gateway to the Konkan and Pune expressways.', tags: ['navi mumbai', 'junction'] },
  { id: 'kalyan-dombivli', name: 'Kalyan-Dombivli', kind: 'city', district: 'Thane', lat: 19.2403, lon: 73.1305, description: 'Suburban twin city at the head of Thane Creek and the Central Railway junction.', tags: ['kalyan', 'dombivli', 'suburb'] },
  { id: 'vasai-virar', name: 'Vasai-Virar', kind: 'city', district: 'Palghar', lat: 19.3919, lon: 72.8397, description: 'Northern suburban city beside the Portuguese-era Vasai fort and the Arabian Sea.', tags: ['vasai', 'virar', 'bassein', 'suburb'] },
  { id: 'mira-bhayandar', name: 'Mira-Bhayandar', kind: 'city', district: 'Thane', lat: 19.2952, lon: 72.8544, description: 'Suburban city on the Vasai creek between Mumbai and Vasai.', tags: ['mira road', 'bhayandar', 'suburb'] },
  { id: 'ulhasnagar', name: 'Ulhasnagar', kind: 'city', district: 'Thane', lat: 19.2215, lon: 73.1645, description: 'Dense suburban city on the Ulhas river east of Kalyan.', tags: ['suburb'] },
  { id: 'bhiwandi', name: 'Bhiwandi', kind: 'city', district: 'Thane', lat: 19.2967, lon: 73.0631, description: 'Powerloom and warehousing city north-east of Thane.', tags: ['powerloom', 'warehouses'] },
  { id: 'malegaon', name: 'Malegaon', kind: 'city', district: 'Nashik', lat: 20.5537, lon: 74.5288, description: 'Powerloom city on the Girna river in northern Nashik district.', tags: ['powerloom', 'girna'] },
  { id: 'nandurbar', name: 'Nandurbar', kind: 'town', district: 'Nandurbar', lat: 21.3700, lon: 74.2400, description: 'Tribal district town of north-west Khandesh below the Satpuda hills.', tags: ['khandesh', 'satpuda'] },
  { id: 'ratnagiri-jaigad', name: 'Jaigad', kind: 'coast', district: 'Ratnagiri', lat: 17.2930, lon: 73.2220, description: 'Cliff-top sea fort and lighthouse at the mouth of the Shastri river.', tags: ['sea fort', 'lighthouse', 'konkan'] },
  { id: 'amboli', name: 'Amboli', kind: 'hill-station', district: 'Sindhudurg', lat: 15.9600, lon: 74.0000, description: 'Wettest hill station of the state on the Sahyadri crest above the Konkan, famous for monsoon waterfalls and amphibians.', tags: ['waterfalls', 'monsoon', 'sahyadri'] },
  { id: 'malshej-ghat', name: 'Malshej Ghat', kind: 'hill-station', district: 'Pune', lat: 19.3400, lon: 73.7750, description: 'Monsoon ghat pass of cliffs, mist and flamingo-visited reservoirs.', tags: ['ghat', 'monsoon', 'flamingos'] },
  { id: 'toranmal', name: 'Toranmal', kind: 'hill-station', district: 'Nandurbar', lat: 21.8800, lon: 74.4800, description: 'Remote Satpuda plateau hill station with Yashavant lake.', tags: ['satpuda'] },
]);

export function cityById(id: string): Destination | undefined {
  return MAHARASHTRA_CITIES.find((c) => c.id === id);
}
