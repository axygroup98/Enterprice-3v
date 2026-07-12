import { ErpProduct, MarketplaceListing } from '../types';

/**
 * Motor Financeiro — Capítulo 6 do Documento Mestre.
 *
 * Reaproveita 100% dos dados já coletados por getErpProducts()/getMarketplaceListings()
 * (preço de custo do Bling, preço/quantidade vendida do ML/Shopee). Nenhuma chamada
 * nova às APIs é feita aqui — funções puras, testáveis, sem I/O.
 */

export interface MarketplaceFees {
  mercadolivrePct: number; // ex.: 12 (%)
  shopeePct: number;
  fixedBrl: number; // custo fixo por venda (embalagem, taxa fixa etc.)
}

export const DEFAULT_FEES: MarketplaceFees = {
  mercadolivrePct: 12,
  shopeePct: 14,
  fixedBrl: 5,
};

export interface ProductProfitability {
  sku: string;
  name: string;
  custo: number;
  precoErp: number;
  precoMl: number | null;
  precoShopee: number | null;
  soldQuantityMl: number;
  margemMlPct: number | null;
  margemShopeePct: number | null;
  margemMlBrl: number | null;
  margemShopeeBrl: number | null;
  melhorCanal: 'mercadolivre' | 'shopee' | null;
  prejudicial: boolean; // margem negativa em algum canal ativo
  indiceRentabilidade: number; // 0-100 (6.15 — Índice de Rentabilidade CIO)
}

/** 6.6/6.7 — margem líquida estimada após comissão do marketplace + custo fixo. */
export function calcMargin(
  precoVenda: number,
  custo: number,
  feePct: number,
  fixedBrl: number
): { margemBrl: number; margemPct: number } {
  const comissao = precoVenda * (feePct / 100);
  const margemBrl = precoVenda - custo - comissao - fixedBrl;
  const margemPct = precoVenda > 0 ? (margemBrl / precoVenda) * 100 : 0;
  return { margemBrl, margemPct };
}

/** 6.15 — Índice de Rentabilidade CIO: combina margem % com giro (quantidade vendida). */
export function calcRentabilidadeIndex(margemPct: number | null, soldQuantity: number): number {
  if (margemPct === null) return 0;
  // Margem contribui 70%, giro (normalizado, saturando em 50 unidades) contribui 30%.
  const margemScore = Math.max(0, Math.min(100, ((margemPct + 20) / 60) * 100)); // -20%..+40% -> 0..100
  const giroScore = Math.max(0, Math.min(100, (soldQuantity / 50) * 100));
  const score = margemScore * 0.7 + giroScore * 0.3;
  return Math.round(Math.max(0, Math.min(100, score)));
}

export function buildProfitability(
  products: ErpProduct[],
  listings: MarketplaceListing[],
  fees: MarketplaceFees = DEFAULT_FEES
): ProductProfitability[] {
  const bySku = new Map<string, MarketplaceListing[]>();
  for (const l of listings) {
    if (!l.sku) continue;
    const arr = bySku.get(l.sku) ?? [];
    arr.push(l);
    bySku.set(l.sku, arr);
  }

  return products
    .filter((p) => p.precoCusto != null && p.precoCusto > 0)
    .map((p) => {
      const custo = p.precoCusto as number;
      const linked = bySku.get(p.sku) ?? [];
      const mlListing = linked.find((l) => l.source === 'mercadolivre' && l.price != null);
      const shopeeListing = linked.find((l) => l.source === 'shopee' && l.price != null);

      const precoMl = mlListing?.price ?? null;
      const precoShopee = shopeeListing?.price ?? null;

      const ml = precoMl != null ? calcMargin(precoMl, custo, fees.mercadolivrePct, fees.fixedBrl) : null;
      const shopee = precoShopee != null ? calcMargin(precoShopee, custo, fees.shopeePct, fees.fixedBrl) : null;

      const melhorCanal: 'mercadolivre' | 'shopee' | null =
        ml && shopee ? (ml.margemPct >= shopee.margemPct ? 'mercadolivre' : 'shopee')
        : ml ? 'mercadolivre'
        : shopee ? 'shopee'
        : null;

      const soldQuantityMl = mlListing?.soldQuantity ?? 0;
      const melhorMargemPct = melhorCanal === 'mercadolivre' ? ml?.margemPct ?? null : melhorCanal === 'shopee' ? shopee?.margemPct ?? null : null;

      return {
        sku: p.sku,
        name: p.name,
        custo,
        precoErp: p.price,
        precoMl,
        precoShopee,
        soldQuantityMl,
        margemMlPct: ml?.margemPct ?? null,
        margemShopeePct: shopee?.margemPct ?? null,
        margemMlBrl: ml?.margemBrl ?? null,
        margemShopeeBrl: shopee?.margemBrl ?? null,
        melhorCanal,
        prejudicial: (ml?.margemBrl ?? 0) < 0 || (shopee?.margemBrl ?? 0) < 0,
        indiceRentabilidade: calcRentabilidadeIndex(melhorMargemPct, soldQuantityMl),
      };
    });
}

/** 6.8 — Simulador de Preços: recalcula margem para um novo preço hipotético. */
export function simulatePrice(
  custo: number,
  novoPreco: number,
  marketplace: 'mercadolivre' | 'shopee',
  fees: MarketplaceFees = DEFAULT_FEES
): { margemBrl: number; margemPct: number } {
  const feePct = marketplace === 'mercadolivre' ? fees.mercadolivrePct : fees.shopeePct;
  return calcMargin(novoPreco, custo, feePct, fees.fixedBrl);
}

/** 6.8 — preço mínimo para atingir uma margem-alvo (%), usado pelo simulador. */
export function priceForTargetMargin(
  custo: number,
  targetMarginPct: number,
  marketplace: 'mercadolivre' | 'shopee',
  fees: MarketplaceFees = DEFAULT_FEES
): number {
  const feePct = (marketplace === 'mercadolivre' ? fees.mercadolivrePct : fees.shopeePct) / 100;
  // preco - custo - preco*feePct - fixed = preco * targetMargin
  // preco * (1 - feePct - targetMargin) = custo + fixed
  const denom = 1 - feePct - targetMarginPct / 100;
  if (denom <= 0) return Infinity;
  return (custo + fees.fixedBrl) / denom;
}

/** 9.12 — Curva ABC: classifica produtos por participação acumulada na receita. */
export interface AbcEntry {
  sku: string;
  name: string;
  receita: number;
  participacaoPct: number;
  participacaoAcumuladaPct: number;
  classe: 'A' | 'B' | 'C';
}

export function calcCurvaAbc(products: ProductProfitability[]): AbcEntry[] {
  const withRevenue = products
    .map((p) => ({ sku: p.sku, name: p.name, receita: (p.precoMl ?? p.precoShopee ?? 0) * p.soldQuantityMl }))
    .filter((p) => p.receita > 0)
    .sort((a, b) => b.receita - a.receita);

  const total = withRevenue.reduce((sum, p) => sum + p.receita, 0);
  let acumuladoAntes = 0;

  return withRevenue.map((p) => {
    const participacaoPct = total > 0 ? (p.receita / total) * 100 : 0;
    // Classe é decidida pelo acumulado ANTES deste item entrar na curva — assim o
    // maior contribuinte da receita é sempre Classe A, mesmo que sozinho já responda
    // por mais de 80% (método clássico da Curva ABC de Pareto).
    const classe: 'A' | 'B' | 'C' = acumuladoAntes < 80 ? 'A' : acumuladoAntes < 95 ? 'B' : 'C';
    acumuladoAntes += participacaoPct;
    return { ...p, participacaoPct, participacaoAcumuladaPct: acumuladoAntes, classe };
  });
}
