export type ProductListItem = {
  id: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  status: string;
  variant_count: number;
  active_variant_count: number;
  min_price_minor: number | null;
  max_price_minor: number | null;
  currency: string;
  updated_at: string;
};

export type ProductBase = {
  id: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  aliases: string;
  status: string;
  summary: string;
  tags: string;
  attributes: string;
  created_at: string;
  updated_at: string;
};

export type ProductSpecDimensionOption = {
  id?: string;
  dimension_id?: string;
  option_key: string;
  option_label: string;
  sort_order: number;
  is_active: number | boolean;
};

export type ProductSpecDimension = {
  id?: string;
  product_id?: string;
  key: string;
  label: string;
  value_type: string;
  unit: string;
  is_required: number | boolean;
  sort_order: number;
  options: ProductSpecDimensionOption[];
};

export type ProductVariantSpecValue = {
  id?: string;
  variant_id?: string;
  dimension_id?: string;
  dimension_key: string;
  dimension_label?: string;
  option_id?: string | null;
  option_key?: string | null;
  value_text: string;
  value_number: number | null;
  value_display: string;
  sort_value?: number | null;
};

export type ProductVariantPrice = {
  id?: string;
  variant_id?: string;
  price_book_id?: string;
  price_book_code: string;
  price_book_name?: string;
  currency?: string;
  pricing_mode: string;
  amount_minor: number | null;
  min_amount_minor: number | null;
  max_amount_minor: number | null;
  min_qty: number;
  effective_from: string | null;
  effective_to: string | null;
  tax_included: number | boolean;
  remarks: string;
  updated_at?: string;
};

export type ProductVariant = {
  id?: string;
  product_id?: string;
  sku: string;
  variant_name: string;
  spec_signature?: string;
  status: string;
  barcode: string;
  weight: number | null;
  lead_time_days: number | null;
  is_default: number | boolean;
  specs: ProductVariantSpecValue[];
  prices: ProductVariantPrice[];
  updated_at?: string;
};

export type PriceBook = {
  id: string;
  code: string;
  name: string;
  currency: string;
  audience_type: string;
  priority: number;
  status: string;
};

export type ProductCatalog = {
  product: ProductBase;
  dimensions: ProductSpecDimension[];
  variants: ProductVariant[];
  price_books: PriceBook[];
};

export type ProductBasePayload = {
  name: string;
  category: string;
  brand: string;
  model: string;
  aliases: string;
  status: string;
  summary: string;
  tags: string;
  attributes: string;
};

export type ProductCatalogPayload = {
  product: ProductBasePayload;
  dimensions: ProductSpecDimension[];
  variants: Array<
    Omit<ProductVariant, 'prices'> & {
      prices?: never;
    }
  >;
  prices: Record<string, ProductVariantPrice[]>;
};
