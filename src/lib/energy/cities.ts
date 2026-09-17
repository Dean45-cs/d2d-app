/**
 * Stammdaten fuer die Energiekarte: deutsche Staedte mit Postleitzahl,
 * Koordinate und dem oertlichen Grundversorger.
 *
 * WICHTIG: Diese Datei enthaelt KEINE Preise. Preise kommen ausschliesslich
 * aus der in .env konfigurierten Tagesquelle (siehe src/lib/energy/adapters.ts).
 * Ohne konfigurierte Quelle erzeugt der Seed-Adapter klar als "Demo"
 * gekennzeichnete Beispielwerte, damit die Karte bedienbar ist.
 */

export interface CityRecord {
  plz: string;
  city: string;
  state: string;
  provider: string;
  lat: number;
  lng: number;
  /** Einwohnerzahl, gerundet - dient nur der Priorisierung in Listen. */
  population: number;
}

export const CITIES: CityRecord[] = [
  { plz: "10115", city: "Berlin", state: "Berlin", provider: "Vattenfall Europe Sales", lat: 52.5200, lng: 13.4050, population: 3700000 },
  { plz: "20095", city: "Hamburg", state: "Hamburg", provider: "Hamburger Energiewerke", lat: 53.5511, lng: 9.9937, population: 1900000 },
  { plz: "80331", city: "München", state: "Bayern", provider: "Stadtwerke München (SWM)", lat: 48.1351, lng: 11.5820, population: 1500000 },
  { plz: "50667", city: "Köln", state: "Nordrhein-Westfalen", provider: "RheinEnergie", lat: 50.9375, lng: 6.9603, population: 1080000 },
  { plz: "60311", city: "Frankfurt am Main", state: "Hessen", provider: "Mainova", lat: 50.1109, lng: 8.6821, population: 760000 },
  { plz: "70173", city: "Stuttgart", state: "Baden-Württemberg", provider: "EnBW Vertrieb", lat: 48.7758, lng: 9.1829, population: 630000 },
  { plz: "40213", city: "Düsseldorf", state: "Nordrhein-Westfalen", provider: "Stadtwerke Düsseldorf", lat: 51.2277, lng: 6.7735, population: 620000 },
  { plz: "04109", city: "Leipzig", state: "Sachsen", provider: "Leipziger Stadtwerke", lat: 51.3397, lng: 12.3731, population: 620000 },
  { plz: "44135", city: "Dortmund", state: "Nordrhein-Westfalen", provider: "DEW21", lat: 51.5136, lng: 7.4653, population: 590000 },
  { plz: "45127", city: "Essen", state: "Nordrhein-Westfalen", provider: "Stadtwerke Essen", lat: 51.4556, lng: 7.0116, population: 580000 },
  { plz: "28195", city: "Bremen", state: "Bremen", provider: "swb Vertrieb Bremen", lat: 53.0793, lng: 8.8017, population: 570000 },
  { plz: "01067", city: "Dresden", state: "Sachsen", provider: "SachsenEnergie", lat: 51.0504, lng: 13.7373, population: 560000 },
  { plz: "30159", city: "Hannover", state: "Niedersachsen", provider: "enercity", lat: 52.3759, lng: 9.7320, population: 540000 },
  { plz: "90402", city: "Nürnberg", state: "Bayern", provider: "N-ERGIE", lat: 49.4521, lng: 11.0767, population: 520000 },
  { plz: "47051", city: "Duisburg", state: "Nordrhein-Westfalen", provider: "Stadtwerke Duisburg", lat: 51.4344, lng: 6.7623, population: 500000 },
  { plz: "44787", city: "Bochum", state: "Nordrhein-Westfalen", provider: "Stadtwerke Bochum", lat: 51.4818, lng: 7.2162, population: 365000 },
  { plz: "42103", city: "Wuppertal", state: "Nordrhein-Westfalen", provider: "WSW Energie & Wasser", lat: 51.2562, lng: 7.1508, population: 355000 },
  { plz: "33602", city: "Bielefeld", state: "Nordrhein-Westfalen", provider: "Stadtwerke Bielefeld", lat: 52.0302, lng: 8.5325, population: 335000 },
  { plz: "53111", city: "Bonn", state: "Nordrhein-Westfalen", provider: "SWB Energie und Wasser", lat: 50.7374, lng: 7.0982, population: 330000 },
  { plz: "48143", city: "Münster", state: "Nordrhein-Westfalen", provider: "Stadtwerke Münster", lat: 51.9607, lng: 7.6261, population: 320000 },
  { plz: "76133", city: "Karlsruhe", state: "Baden-Württemberg", provider: "Stadtwerke Karlsruhe", lat: 49.0069, lng: 8.4037, population: 310000 },
  { plz: "68159", city: "Mannheim", state: "Baden-Württemberg", provider: "MVV Energie", lat: 49.4875, lng: 8.4660, population: 315000 },
  { plz: "86150", city: "Augsburg", state: "Bayern", provider: "Stadtwerke Augsburg (swa)", lat: 48.3705, lng: 10.8978, population: 300000 },
  { plz: "65183", city: "Wiesbaden", state: "Hessen", provider: "ESWE Versorgung", lat: 50.0826, lng: 8.2400, population: 280000 },
  { plz: "41061", city: "Mönchengladbach", state: "Nordrhein-Westfalen", provider: "NEW Niederrhein Energie", lat: 51.1805, lng: 6.4428, population: 260000 },
  { plz: "45879", city: "Gelsenkirchen", state: "Nordrhein-Westfalen", provider: "ELE Emscher Lippe Energie", lat: 51.5177, lng: 7.0857, population: 260000 },
  { plz: "38100", city: "Braunschweig", state: "Niedersachsen", provider: "BS|Energy", lat: 52.2689, lng: 10.5268, population: 250000 },
  { plz: "09111", city: "Chemnitz", state: "Sachsen", provider: "eins energie in sachsen", lat: 50.8278, lng: 12.9214, population: 245000 },
  { plz: "24103", city: "Kiel", state: "Schleswig-Holstein", provider: "Stadtwerke Kiel", lat: 54.3233, lng: 10.1228, population: 245000 },
  { plz: "52062", city: "Aachen", state: "Nordrhein-Westfalen", provider: "STAWAG", lat: 50.7753, lng: 6.0839, population: 250000 },
  { plz: "06108", city: "Halle (Saale)", state: "Sachsen-Anhalt", provider: "EVH Halle", lat: 51.4825, lng: 11.9705, population: 240000 },
  { plz: "39104", city: "Magdeburg", state: "Sachsen-Anhalt", provider: "SWM Magdeburg", lat: 52.1205, lng: 11.6276, population: 240000 },
  { plz: "79098", city: "Freiburg im Breisgau", state: "Baden-Württemberg", provider: "badenova", lat: 47.9990, lng: 7.8421, population: 230000 },
  { plz: "47798", city: "Krefeld", state: "Nordrhein-Westfalen", provider: "SWK Energie", lat: 51.3388, lng: 6.5853, population: 228000 },
  { plz: "23552", city: "Lübeck", state: "Schleswig-Holstein", provider: "Stadtwerke Lübeck", lat: 53.8655, lng: 10.6866, population: 217000 },
  { plz: "46045", city: "Oberhausen", state: "Nordrhein-Westfalen", provider: "energieversorgung oberhausen (evo)", lat: 51.4963, lng: 6.8638, population: 210000 },
  { plz: "99084", city: "Erfurt", state: "Thüringen", provider: "SWE Energie", lat: 50.9848, lng: 11.0299, population: 214000 },
  { plz: "55116", city: "Mainz", state: "Rheinland-Pfalz", provider: "Mainzer Stadtwerke", lat: 49.9929, lng: 8.2473, population: 218000 },
  { plz: "18055", city: "Rostock", state: "Mecklenburg-Vorpommern", provider: "Stadtwerke Rostock", lat: 54.0924, lng: 12.0991, population: 209000 },
  { plz: "34117", city: "Kassel", state: "Hessen", provider: "Städtische Werke Kassel", lat: 51.3127, lng: 9.4797, population: 205000 },
  { plz: "58095", city: "Hagen", state: "Nordrhein-Westfalen", provider: "Mark-E (ENERVIE)", lat: 51.3671, lng: 7.4633, population: 189000 },
  { plz: "66111", city: "Saarbrücken", state: "Saarland", provider: "energis / Energie SaarLorLux", lat: 49.2402, lng: 6.9969, population: 180000 },
  { plz: "14467", city: "Potsdam", state: "Brandenburg", provider: "Energie und Wasser Potsdam (EWP)", lat: 52.3906, lng: 13.0645, population: 185000 },
  { plz: "67059", city: "Ludwigshafen am Rhein", state: "Rheinland-Pfalz", provider: "TWL Technische Werke Ludwigshafen", lat: 49.4774, lng: 8.4452, population: 172000 },
  { plz: "49074", city: "Osnabrück", state: "Niedersachsen", provider: "Stadtwerke Osnabrück", lat: 52.2799, lng: 8.0472, population: 165000 },
  { plz: "26122", city: "Oldenburg", state: "Niedersachsen", provider: "EWE Vertrieb", lat: 53.1435, lng: 8.2146, population: 170000 },
  { plz: "51373", city: "Leverkusen", state: "Nordrhein-Westfalen", provider: "EVL Energieversorgung Leverkusen", lat: 51.0459, lng: 6.9877, population: 164000 },
  { plz: "42651", city: "Solingen", state: "Nordrhein-Westfalen", provider: "Stadtwerke Solingen", lat: 51.1652, lng: 7.0671, population: 160000 },
  { plz: "69117", city: "Heidelberg", state: "Baden-Württemberg", provider: "Stadtwerke Heidelberg", lat: 49.3988, lng: 8.6724, population: 160000 },
  { plz: "64283", city: "Darmstadt", state: "Hessen", provider: "ENTEGA", lat: 49.8728, lng: 8.6512, population: 160000 },
  { plz: "33098", city: "Paderborn", state: "Nordrhein-Westfalen", provider: "Westfalen Weser Energie", lat: 51.7189, lng: 8.7575, population: 152000 },
  { plz: "93047", city: "Regensburg", state: "Bayern", provider: "REWAG", lat: 49.0134, lng: 12.1016, population: 155000 },
  { plz: "85049", city: "Ingolstadt", state: "Bayern", provider: "Stadtwerke Ingolstadt", lat: 48.7665, lng: 11.4258, population: 140000 },
  { plz: "97070", city: "Würzburg", state: "Bayern", provider: "WVV Würzburg", lat: 49.7913, lng: 9.9534, population: 128000 },
  { plz: "90762", city: "Fürth", state: "Bayern", provider: "infra fürth", lat: 49.4783, lng: 10.9903, population: 130000 },
  { plz: "38440", city: "Wolfsburg", state: "Niedersachsen", provider: "LSW Energie", lat: 52.4227, lng: 10.7865, population: 125000 },
  { plz: "63065", city: "Offenbach am Main", state: "Hessen", provider: "EVO Energieversorgung Offenbach", lat: 50.0956, lng: 8.7761, population: 132000 },
  { plz: "89073", city: "Ulm", state: "Baden-Württemberg", provider: "SWU Stadtwerke Ulm", lat: 48.4011, lng: 9.9876, population: 128000 },
  { plz: "74072", city: "Heilbronn", state: "Baden-Württemberg", provider: "Stadtwerke Heilbronn", lat: 49.1427, lng: 9.2109, population: 126000 },
  { plz: "75175", city: "Pforzheim", state: "Baden-Württemberg", provider: "SWP Stadtwerke Pforzheim", lat: 48.8922, lng: 8.6946, population: 126000 },
  { plz: "37073", city: "Göttingen", state: "Niedersachsen", provider: "Stadtwerke Göttingen", lat: 51.5413, lng: 9.9158, population: 118000 },
  { plz: "46236", city: "Bottrop", state: "Nordrhein-Westfalen", provider: "ELE Emscher Lippe Energie", lat: 51.5216, lng: 6.9289, population: 117000 },
  { plz: "54290", city: "Trier", state: "Rheinland-Pfalz", provider: "SWT Stadtwerke Trier", lat: 49.7596, lng: 6.6439, population: 111000 },
  { plz: "45657", city: "Recklinghausen", state: "Nordrhein-Westfalen", provider: "Stadtwerke Recklinghausen", lat: 51.6142, lng: 7.1979, population: 111000 },
  { plz: "27568", city: "Bremerhaven", state: "Bremen", provider: "swb Vertrieb Bremerhaven", lat: 53.5396, lng: 8.5809, population: 113000 },
  { plz: "07743", city: "Jena", state: "Thüringen", provider: "Stadtwerke Energie Jena-Pößneck", lat: 50.9271, lng: 11.5892, population: 111000 },
  { plz: "58636", city: "Iserlohn", state: "Nordrhein-Westfalen", provider: "Stadtwerke Iserlohn", lat: 51.3747, lng: 7.7020, population: 92000 },
  { plz: "57072", city: "Siegen", state: "Nordrhein-Westfalen", provider: "Siegener Versorgungsbetriebe", lat: 50.8748, lng: 8.0243, population: 103000 },
  { plz: "31134", city: "Hildesheim", state: "Niedersachsen", provider: "EVI Energieversorgung Hildesheim", lat: 52.1548, lng: 9.9511, population: 101000 },
  { plz: "38226", city: "Salzgitter", state: "Niedersachsen", provider: "Avacon", lat: 52.1533, lng: 10.3333, population: 104000 },
  { plz: "03046", city: "Cottbus", state: "Brandenburg", provider: "Stadtwerke Cottbus", lat: 51.7563, lng: 14.3329, population: 98000 },
  { plz: "07545", city: "Gera", state: "Thüringen", provider: "EGP Energieversorgung Gera", lat: 50.8807, lng: 12.0820, population: 93000 },
  { plz: "67655", city: "Kaiserslautern", state: "Rheinland-Pfalz", provider: "SWK Stadtwerke Kaiserslautern", lat: 49.4401, lng: 7.7491, population: 100000 },
  { plz: "19053", city: "Schwerin", state: "Mecklenburg-Vorpommern", provider: "Stadtwerke Schwerin", lat: 53.6355, lng: 11.4012, population: 96000 },
  { plz: "59065", city: "Hamm", state: "Nordrhein-Westfalen", provider: "Stadtwerke Hamm", lat: 51.6739, lng: 7.8158, population: 180000 },
  { plz: "45468", city: "Mülheim an der Ruhr", state: "Nordrhein-Westfalen", provider: "medl / RWE", lat: 51.4275, lng: 6.8826, population: 172000 },
  { plz: "32423", city: "Minden", state: "Nordrhein-Westfalen", provider: "Stadtwerke Minden", lat: 52.2886, lng: 8.9146, population: 82000 },
  { plz: "21335", city: "Lüneburg", state: "Niedersachsen", provider: "Avacon", lat: 53.2464, lng: 10.4115, population: 77000 },
  { plz: "76646", city: "Bruchsal", state: "Baden-Württemberg", provider: "Stadtwerke Bruchsal", lat: 49.1244, lng: 8.5983, population: 45000 },
  { plz: "94032", city: "Passau", state: "Bayern", provider: "Stadtwerke Passau", lat: 48.5734, lng: 13.4610, population: 53000 },
  { plz: "87435", city: "Kempten (Allgäu)", state: "Bayern", provider: "Allgäuer Überlandwerk (AÜW)", lat: 47.7267, lng: 10.3168, population: 70000 },
  { plz: "78462", city: "Konstanz", state: "Baden-Württemberg", provider: "Stadtwerke Konstanz", lat: 47.6603, lng: 9.1758, population: 85000 },
  { plz: "26382", city: "Wilhelmshaven", state: "Niedersachsen", provider: "EWE Vertrieb", lat: 53.5288, lng: 8.1128, population: 76000 },
  { plz: "16816", city: "Neuruppin", state: "Brandenburg", provider: "Stadtwerke Neuruppin", lat: 52.9270, lng: 12.8033, population: 31000 },
  { plz: "02625", city: "Bautzen", state: "Sachsen", provider: "Energie- und Wasserwerke Bautzen", lat: 51.1814, lng: 14.4239, population: 39000 },
  { plz: "36037", city: "Fulda", state: "Hessen", provider: "RhönEnergie Fulda", lat: 50.5558, lng: 9.6808, population: 69000 },
  { plz: "35390", city: "Gießen", state: "Hessen", provider: "Stadtwerke Gießen", lat: 50.5841, lng: 8.6784, population: 90000 },
  { plz: "56068", city: "Koblenz", state: "Rheinland-Pfalz", provider: "evm Energieversorgung Mittelrhein", lat: 50.3569, lng: 7.5890, population: 114000 },
];
