// Mock master data — แทนที่ด้วย API จริง (partner / stone-master) ภายหลัง

export type Option = { value: string; label: string };

export type CustomerOption = Option & {
  addresses: (Option & { kind: "SHIPPING" | "INVOICE" | "BOTH" })[];
};

export const customers: CustomerOption[] = [
  {
    value: "CUS-0001",
    label: "CUS-0001 · Siam Gems Co., Ltd.",
    addresses: [
      { value: "ADR-0001", label: "HQ · 919/1 Silom Rd, Bang Rak, Bangkok 10500", kind: "BOTH" },
      { value: "ADR-0002", label: "Warehouse · 55 Charoen Krung Rd, Bangkok 10120", kind: "SHIPPING" },
    ],
  },
  {
    value: "CUS-0002",
    label: "CUS-0002 · Chanthaburi Jewelry Ltd.",
    addresses: [{ value: "ADR-0003", label: "12 Si Chan Rd, Mueang, Chanthaburi 22000", kind: "BOTH" }],
  },
  {
    value: "CUS-0003",
    label: "CUS-0003 · Geneva Fine Stones SA",
    addresses: [
      { value: "ADR-0004", label: "Rue du Rhône 42, 1204 Genève, CH", kind: "INVOICE" },
      { value: "ADR-0005", label: "Freeport Geneva, Route du Grand-Lancy 6, CH", kind: "SHIPPING" },
    ],
  },
];

export const currencies: (Option & { rateToThb: string })[] = [
  { value: "USD", label: "USD", rateToThb: "36.25" },
  { value: "THB", label: "THB", rateToThb: "1" },
  { value: "EUR", label: "EUR", rateToThb: "39.10" },
];

export const locations: Option[] = [
  { value: "BKK-01", label: "BKK-01" },
  { value: "BKK-02", label: "BKK-02" },
  { value: "CTB-01", label: "CTB-01" },
];

export type StoneCodeOption = Option & {
  stone: string; shape: string; size: string; color: string; clarity: string; cutting: string; quality: string;
};

export const stoneCodes: StoneCodeOption[] = [
  { value: "ALCS-LBEXVS1AAA", label: "ALCS-LBEXVS1AAA", stone: "Alexandrite", shape: "Cushion", size: "3.0×4.0 mm", color: "Light Blue", clarity: "VS1", cutting: "Excellent", quality: "AAA" },
  { value: "RUOV-PBEXVVS1AAA", label: "RUOV-PBEXVVS1AAA", stone: "Ruby", shape: "Oval", size: "5.0×7.0 mm", color: "Pigeon Blood", clarity: "VVS1", cutting: "Excellent", quality: "AAA" },
  { value: "SPPR-PNEXVS1AAA", label: "SPPR-PNEXVS1AAA", stone: "Spinel", shape: "Pear", size: "4.0×6.0 mm", color: "Pink", clarity: "VS1", cutting: "Excellent", quality: "AAA" },
  { value: "SACU-RBVGVS1AA", label: "SACU-RBVGVS1AA", stone: "Sapphire", shape: "Cushion", size: "6.0×6.0 mm", color: "Royal Blue", clarity: "VS1", cutting: "Very Good", quality: "AA" },
];

const unique = (key: keyof StoneCodeOption): Option[] =>
  [...new Set(stoneCodes.map((s) => s[key]))].map((v) => ({ value: v, label: v }));

export const stones = unique("stone");
export const shapes = unique("shape");
export const sizes = unique("size");
export const colors = unique("color");
export const clarities = unique("clarity");
export const cuttings = unique("cutting");
export const qualities = unique("quality");
export const cerTypes: Option[] = ["GIA", "GRS", "AIGS", "GIT", "SSEF"].map((v) => ({ value: v, label: v }));

export const taxCodes: (Option & { rate: string })[] = [
  { value: "VAT7", label: "VAT 7%", rate: "0.07" },
  { value: "VAT0", label: "VAT 0%", rate: "0" },
];

export const serviceChargeTypes: Option[] = [
  { value: "SHIPPING", label: "Shipping" },
  { value: "HANDLING", label: "Handling fee" },
  { value: "INSURANCE", label: "Insurance" },
  { value: "CERTIFICATE", label: "Certificate fee" },
];
