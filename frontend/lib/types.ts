export interface Country {
  iso3: string;
  name: string;
  currency: string;
  region: string;
}

export interface Sector {
  id: string;
  name: string;
  short: string;
  description: string;
}

export interface Occupation {
  code: string;
  name: string;
}

export interface Source {
  id: string;
  name: string;
  url: string;
  api?: string;
  license?: string;
  retrieved_at?: string;
  used_for?: string[];
}

export interface MissingData {
  dataset: string;
  scope: string;
  issue: string;
  treatment: string;
}

export interface DatasetStatus {
  name: string;
  available: boolean;
  file: string;
  rows?: number;
  bytes?: number;
  modified_at?: string;
}

export interface SectorIndicator {
  sector_id: string;
  sector_name: string;
  indicator_id: string;
  indicator_name: string;
  indicator_unit: string;
  indicator_role: string;
  is_proxy: boolean;
  proxy_note: string;
  observations: number;
  countries: number;
  year_min: number;
  year_max: number;
}

export interface ProjectMeta {
  project: string;
  generated_at: string;
  historical_period: { start: number; end: number };
  forecast_period: { start: number; end: number };
  frequency: string;
  countries: Country[];
  sectors: Sector[];
  occupations: Occupation[];
  sector_indicators: SectorIndicator[];
  living_cost_categories: {
    expense_category: string;
    expense_label: string;
    expense_unit: string;
    observations: number;
    year_min: number;
    year_max: number;
  }[];
  employment_coverage: {
    mapping_granularity: string;
    observations: number;
    countries: number;
    sectors: number;
    occupations: number;
    year_min: number;
    year_max: number;
  }[];
  datasets: DatasetStatus[];
  sources: Source[];
  missing_data: MissingData[];
  method_notes: Record<string, string>;
  forecast: {
    model_version?: string;
    rows?: number;
    series?: number;
    by_status?: Record<string, number>;
    method?: Record<string, unknown>;
    notes?: string[];
  };
}

export interface EnvelopeMeta {
  dataset: string;
  row_count: number;
  generated_at: string | null;
  historical_period?: { start: number; end: number };
  forecast_period?: { start: number; end: number };
  filters: Record<string, unknown>;
  units: string[];
  sources: Source[];
  source_note: string | null;
  warnings: string[];
  api_version: string;
  [key: string]: unknown;
}

export interface Envelope<T> {
  meta: EnvelopeMeta;
  data: T[];
}

export interface CountrySectorRow {
  country_iso3: string;
  country_name: string;
  sector_id: string;
  sector_name: string;
  year: number;
  indicator_id: string;
  indicator_name: string;
  indicator_role: string;
  indicator_value: number | null;
  indicator_unit: string;
  industrial_output: number | null;
  industrial_output_unit: string;
  output_growth: number | null;
  is_proxy: boolean;
  proxy_note: string;
  investment_announced?: number | null;
  investment_realized?: number | null;
  capacity_addition?: string | null;
  source_name: string;
  source_url: string;
  observation_status: string;
}

export interface IndustrialProjectRow {
  country_iso3: string;
  country_name: string;
  sector_id: string;
  sector_name: string;
  project_name: string;
  sponsor: string;
  investment_usd_million?: number | null;
  investment_announced_usd?: number | null;
  location?: string;
  capacity?: string | null;
  capacity_addition?: string | null;
  status: string;
  announced_year?: number;
  announcement_year?: number;
  operational_year?: number | null;
  completion_year?: number | null;
  jobs_created?: number | null;
  jobs_expected?: number | null;
  source?: string;
}

export interface SectorGrowthRow {
  country_iso3: string;
  country_name: string;
  sector_id: string;
  sector_name: string;
  indicator_id: string;
  indicator_name: string;
  indicator_unit: string;
  is_proxy: boolean;
  first_value: number;
  first_year: number;
  last_value: number;
  last_year: number;
  observations: number;
  cagr_pct: number | null;
  years_span: number;
  note: string;
}

export interface EmploymentRow {
  country_iso3: string;
  country_name: string;
  sector_id: string;
  sector_name: string;
  occupation_code: string;
  occupation_name: string;
  year: number;
  employment: number | null;
  employment_unit: string;
  employment_growth: number | null;
  vacancies: number | null;
  vacancy_rate: number | null;
  industry_code: string;
  industry_name: string;
  mapping_granularity: string;
  mapping_quality: string;
  classification_system: string;
  occupation_classification: string;
  mapping_note: string;
  source_name: string;
  source_url: string;
  observation_status: string;
}

export interface SalaryRow {
  country_iso3: string;
  country_name: string;
  occupation_code: string;
  occupation_name: string;
  year: number;
  salary_mean: number | null;
  salary_median: number | null;
  salary_real_2010: number | null;
  salary_ppp_intl: number | null;
  currency: string;
  pay_period: string;
  gross_or_net: string;
  nominal_or_real: string;
  occupation_classification: string;
  conversion_note: string;
  source_name: string;
  source_url: string;
  observation_status: string;
}

export interface CountryContextRow {
  country_iso3: string;
  country_name: string;
  year: number;
  indicator_id: string;
  indicator_name: string;
  value: number | null;
  unit: string;
  source_name: string;
  source_url: string;
  retrieved_at: string;
}

export interface LivingCostRow {
  country_iso3: string;
  country_name: string;
  city: string;
  year: number;
  expense_category: string;
  expense_label: string;
  expense_value: number | null;
  currency: string;
  expense_unit: string;
  household_profile: string;
  indicator_id: string;
  source_name: string;
  source_url: string;
  observation_status: string;
}

export interface ForecastRow {
  country_iso3: string;
  country_name: string;
  sector_id: string;
  sector_name: string;
  occupation_code: string;
  occupation_name: string;
  indicator_id: string;
  indicator_name: string;
  target_year: number;
  predicted_value: number;
  lower_interval: number;
  upper_interval: number;
  indicator_unit: string;
  model_name: string;
  model_version: string;
  forecast_origin: number;
  training_end_year: number;
  scenario: string;
  validation_status: "validated" | "moderate_error" | "high_error";
  validation_mape: number | null;
  validation_rmse: number | null;
  validation_n: number | null;
  validation_coverage_pct: number | null;
  interval_level: number;
  interval_method: string;
  series_label: string;
  granularity: string;
  dataset: string;
  source_name: string;
  source_url: string;
}

export interface CoverageCell {
  country_iso3: string;
  country_name?: string;
  sector_id: string;
  sector_name?: string;
  coverage_pct?: number;
  observations: number;
  expected?: number;
  indicators?: number;
  occupations?: number;
  status?: string;
  granularity?: string;
}

export interface CoveragePayload {
  coverage: {
    country_sector_matrix?: CoverageCell[];
    employment_matrix?: CoverageCell[];
    salary_matrix?: CoverageCell[];
    living_cost_matrix?: CoverageCell[];
    country_sector?: { rows: number; countries: string[]; sectors: string[]; year_min: number; year_max: number };
    employment?: { rows: number; countries: string[]; sectors: string[]; year_min: number; year_max: number };
    salary?: { rows: number; countries: string[]; sectors: string[]; year_min: number; year_max: number };
    living_cost?: { rows: number; countries: string[]; sectors: string[]; year_min: number; year_max: number };
  };
}

export interface QualitySummaryRow {
  dataset: string;
  available: boolean;
  rows: number;
  columns?: number;
  file_bytes?: number;
  null_counts?: Record<string, number | null>;
}

export interface QualityPayload {
  missing_data: MissingData[];
  sources: Source[];
  generated_at: string;
  forecast_metadata: Record<string, unknown>;
}

export interface ForecastSummaryRow {
  dataset: string;
  validation_status: string;
  forecast_rows: number;
  series: number;
  first_target_year: number;
  last_target_year: number;
}

export interface ValidationRow {
  dataset: string;
  country_iso3: string;
  country_name: string;
  sector_id: string;
  sector_name: string;
  occupation_code: string;
  occupation_name: string;
  indicator_id: string;
  indicator_name: string;
  granularity: string;
  series_label: string;
  validation_status: string;
  validation_mape: number | null;
  validation_rmse: number | null;
  validation_n: number | null;
  validation_coverage_pct: number | null;
  model_name: string;
  first_target_year: number;
  last_target_year: number;
  forecast_rows: number;
}

export interface OutlookPayload {
  actual: { year: number; value: number | null; unit: string; source_url: string; observation_status: string }[];
  forecast: ForecastRow[];
  unit: string;
  source_url: string;
}
