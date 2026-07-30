// ─────────────────────────────────────────────────────────────────────────────
// UAE bank reference data — pure, dependency-free, no I/O.
//
// Backs the bank/issuer picker on debit-card and credit-card accounts. Users
// pick a bank by name; `bankType` and `headquarter` are looked up here for
// display rather than duplicated into the database.
// ─────────────────────────────────────────────────────────────────────────────

export interface Bank {
  name: string;
  abbreviation: string | null;
  bankType: string;
  headquarter: string;
}

export const UAE_BANKS: Bank[] = [
  { name: "Abu Dhabi Commercial Bank", abbreviation: "ADCB", bankType: "National", headquarter: "Abu Dhabi" },
  { name: "Abu Dhabi Islamic Bank", abbreviation: "ADIB", bankType: "National (Islamic)", headquarter: "Abu Dhabi" },
  { name: "Ajman Bank", abbreviation: null, bankType: "National (Islamic)", headquarter: "Ajman" },
  {
    name: "Al Hilal Bank",
    abbreviation: null,
    bankType: "National (Islamic) - part of ADCB group",
    headquarter: "Abu Dhabi",
  },
  { name: "Al Maryah Community Bank", abbreviation: "Mbank", bankType: "National", headquarter: "Abu Dhabi" },
  { name: "Bank of Sharjah", abbreviation: "BOS", bankType: "National", headquarter: "Sharjah" },
  { name: "Commercial Bank International", abbreviation: "CBI", bankType: "National", headquarter: "Dubai" },
  { name: "Commercial Bank of Dubai", abbreviation: "CBD", bankType: "National", headquarter: "Dubai" },
  { name: "Dubai Islamic Bank", abbreviation: "DIB", bankType: "National (Islamic)", headquarter: "Dubai" },
  { name: "Emirates Investment Bank", abbreviation: "EIB", bankType: "National", headquarter: "Dubai" },
  { name: "Emirates Islamic", abbreviation: "EI", bankType: "National (Islamic)", headquarter: "Dubai" },
  { name: "Emirates NBD", abbreviation: "ENBD", bankType: "National", headquarter: "Dubai" },
  { name: "First Abu Dhabi Bank", abbreviation: "FAB", bankType: "National", headquarter: "Abu Dhabi" },
  { name: "Invest Bank", abbreviation: null, bankType: "National", headquarter: "Sharjah" },
  { name: "Mashreq", abbreviation: null, bankType: "National", headquarter: "Dubai" },
  { name: "National Bank of Fujairah", abbreviation: "NBF", bankType: "National", headquarter: "Fujairah" },
  {
    name: "National Bank of Umm Al-Qaiwain",
    abbreviation: "NBQ",
    bankType: "National",
    headquarter: "Umm Al Quwain",
  },
  {
    name: "RAKBANK (National Bank of Ras Al Khaimah)",
    abbreviation: "RAKBANK",
    bankType: "National",
    headquarter: "Ras Al Khaimah",
  },
  { name: "Ruya Community Islamic Bank", abbreviation: null, bankType: "National (Islamic)", headquarter: "Ajman" },
  { name: "Sharjah Islamic Bank", abbreviation: "SIB", bankType: "National (Islamic)", headquarter: "Sharjah" },
  { name: "United Arab Bank", abbreviation: "UAB", bankType: "National", headquarter: "Sharjah" },
  { name: "Wio Bank", abbreviation: null, bankType: "National (Digital)", headquarter: "Abu Dhabi" },
  { name: "Zand Bank", abbreviation: null, bankType: "National (Digital)", headquarter: "Dubai" },
  {
    name: "National Bank of Bahrain",
    abbreviation: "NBB",
    bankType: "Foreign",
    headquarter: "Bahrain (branch in Abu Dhabi)",
  },
  {
    name: "Gulf International Bank",
    abbreviation: "GIB",
    bankType: "Foreign",
    headquarter: "Bahrain (branch in Abu Dhabi)",
  },
  { name: "Janata Bank Limited", abbreviation: null, bankType: "Foreign", headquarter: "Bangladesh" },
  { name: "Bank of China Limited", abbreviation: "BOC", bankType: "Foreign", headquarter: "China" },
  { name: "Agricultural Bank of China Ltd.", abbreviation: "ABC", bankType: "Foreign", headquarter: "China" },
  { name: "Banque Misr", abbreviation: null, bankType: "Foreign", headquarter: "Egypt" },
  { name: "Arab African International Bank", abbreviation: "AAIB", bankType: "Foreign", headquarter: "Egypt" },
  { name: "Credit Agricole", abbreviation: null, bankType: "Foreign", headquarter: "France" },
  { name: "BNP Paribas", abbreviation: null, bankType: "Foreign", headquarter: "France" },
  { name: "Banque Banorient France", abbreviation: null, bankType: "Foreign", headquarter: "France" },
  { name: "Habib Bank AG Zurich", abbreviation: null, bankType: "Foreign", headquarter: "Switzerland" },
  { name: "Standard Chartered Bank", abbreviation: "SCB", bankType: "Foreign", headquarter: "United Kingdom" },
  { name: "HSBC Bank Middle East", abbreviation: "HSBC", bankType: "Foreign", headquarter: "United Kingdom" },
  { name: "Citibank", abbreviation: null, bankType: "Foreign", headquarter: "United States" },
  { name: "Barclays Bank", abbreviation: null, bankType: "Foreign", headquarter: "United Kingdom" },
  { name: "Deutsche Bank", abbreviation: null, bankType: "Foreign", headquarter: "Germany" },
  { name: "State Bank of India", abbreviation: "SBI", bankType: "Foreign", headquarter: "India" },
  { name: "Bank of Baroda", abbreviation: null, bankType: "Foreign", headquarter: "India" },
  { name: "ICICI Bank", abbreviation: null, bankType: "Foreign", headquarter: "India" },
  { name: "Habib Bank Limited", abbreviation: "HBL", bankType: "Foreign", headquarter: "Pakistan" },
  { name: "United Bank Limited", abbreviation: "UBL", bankType: "Foreign", headquarter: "Pakistan" },
  { name: "National Bank of Kuwait", abbreviation: "NBK", bankType: "Foreign", headquarter: "Kuwait" },
  { name: "Doha Bank", abbreviation: null, bankType: "Foreign", headquarter: "Qatar" },
  { name: "Arab Bank", abbreviation: null, bankType: "Foreign", headquarter: "Jordan" },
  { name: "El Nilein Bank", abbreviation: null, bankType: "Foreign (Islamic)", headquarter: "Sudan" },
  { name: "BOK International Bank", abbreviation: "BOK", bankType: "Foreign (Islamic)", headquarter: "Iraq" },
];

const BY_NAME = new Map(UAE_BANKS.map((b) => [b.name, b]));

/** Look up a bank's reference data by its exact canonical name. */
export function findBank(name: string): Bank | undefined {
  return BY_NAME.get(name);
}

/** Whether `name` is one of the known canonical bank names. */
export function isKnownBank(name: string): boolean {
  return BY_NAME.has(name);
}
