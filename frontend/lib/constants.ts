export const FALLBACK_COUNTRIES = [
  { iso3: "IND", name: "India", currency: "INR", region: "South Asia" },
  { iso3: "DEU", name: "Germany", currency: "EUR", region: "Europe" },
  { iso3: "CAN", name: "Canada", currency: "CAD", region: "North America" },
  { iso3: "USA", name: "United States", currency: "USD", region: "North America" },
  { iso3: "GBR", name: "United Kingdom", currency: "GBP", region: "Europe" },
  { iso3: "JPN", name: "Japan", currency: "JPY", region: "East Asia" },
];

export const FALLBACK_SECTORS = [
  {
    id: "semiconductors",
    name: "Semiconductors and Electronics",
    short: "Semiconductors",
    description: "Electronic components, computing hardware and semiconductor supply chains.",
  },
  {
    id: "ai_software",
    name: "AI and Software",
    short: "AI & Software",
    description: "Software production, ICT services and research intensity relevant to AI.",
  },
  {
    id: "renewable_energy",
    name: "Renewable Energy",
    short: "Renewable Energy",
    description: "Renewable energy consumption and low-carbon electricity supply.",
  },
  {
    id: "automotive_ev",
    name: "Automotive and Electric Vehicles",
    short: "Automotive & EV",
    description: "Motor-vehicle manufacturing, distribution and electrification capacity.",
  },
  {
    id: "healthcare_biotech",
    name: "Healthcare and Biotechnology",
    short: "Healthcare & Biotech",
    description: "Health expenditure, health-sector employment and biomedical research.",
  },
];

export const FALLBACK_OCCUPATIONS = [
  { code: "TOTAL", name: "All occupations" },
  { code: "1", name: "Managers" },
  { code: "2", name: "Professionals" },
  { code: "3", name: "Technicians and associate professionals" },
  { code: "4", name: "Clerical support workers" },
  { code: "5", name: "Service and sales workers" },
  { code: "6", name: "Skilled agricultural, forestry and fishery workers" },
  { code: "7", name: "Craft and related trades workers" },
  { code: "8", name: "Plant and machine operators, and assemblers" },
  { code: "9", name: "Elementary occupations" },
];

export const DEFAULT_COUNTRIES = FALLBACK_COUNTRIES.map((country) => country.iso3);
export const DEFAULT_SECTORS = FALLBACK_SECTORS.map((sector) => sector.id);
export const DEFAULT_FROM = 2010;
export const DEFAULT_TO = 2024;

export const NAV_ITEMS = [
  { href: "/", label: "Research Overview", short: "Overview", icon: "LayoutDashboard" },
  { href: "/sectors", label: "Global Sector Development", short: "Sectors", icon: "Globe2" },
  { href: "/comparison", label: "Country Comparison", short: "Comparison", icon: "BarChart3" },
  { href: "/employment", label: "Employment Intelligence", short: "Employment", icon: "Users" },
  { href: "/salary", label: "Salary Analysis", short: "Salary", icon: "Banknote" },
  { href: "/living-cost", label: "Living Cost Analysis", short: "Living Cost", icon: "House" },
  { href: "/forecast", label: "Forecast & Future Outlook", short: "Forecast", icon: "TrendingUp" },
  { href: "/methodology", label: "Data Quality & Methodology", short: "Methodology", icon: "ShieldCheck" },
] as const;
