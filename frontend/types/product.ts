export type Product = {
  id: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  sku: string;
  aliases: string;
  price: string;
  currency: string;
  status: string;
  summary: string;
  tags: string;
  attributes: string;
  created_at: string;
  updated_at: string;
};

export type ProductPayload = {
  name: string;
  category: string;
  brand: string;
  model: string;
  sku: string;
  aliases: string;
  price: string;
  currency: string;
  status: string;
  summary: string;
  tags: string;
  attributes: string;
};
