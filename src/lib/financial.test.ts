import { describe, it, expect } from 'vitest';
import {
  calcMargin,
  calcRentabilidadeIndex,
  buildProfitability,
  simulatePrice,
  priceForTargetMargin,
  calcCurvaAbc,
  DEFAULT_FEES,
} from './financial';
import { ErpProduct, MarketplaceListing } from '../types';

function erp(overrides: Partial<ErpProduct>): ErpProduct {
  return {
    sku: 'SKU1', name: 'Produto 1', stock: 10, price: 100, precoCusto: 50,
    categoria: null, marca: null, gtin: null, peso: null, situacao: null,
    ncm: null, tipo: null, unidade: null, photoCount: 1, hasPhoto: true,
    descriptionText: null, hasDescription: true,
    ...overrides,
  };
}

function listing(overrides: Partial<MarketplaceListing>): MarketplaceListing {
  return {
    itemId: 'ML1', sku: 'SKU1', source: 'mercadolivre', title: 'Produto 1', stock: 10,
    status: 'active', price: 100, soldQuantity: 20, health: 1, permalink: null,
    thumbnail: null, pictureCount: 1, videoId: null, listingType: null, condition: null,
    categoryId: null, freeShipping: null, localPickUp: null, warranty: null,
    acceptsMercadoPago: null, catalogListing: null, attributes: [], tags: [],
    dateCreated: null, lastUpdated: null, erpSku: 'SKU1', erpName: 'Produto 1', erpStock: 10,
    ...overrides,
  };
}

describe('calcMargin', () => {
  it('calcula margem líquida descontando comissão e taxa fixa', () => {
    const { margemBrl, margemPct } = calcMargin(100, 50, 12, 5);
    // 100 - 50 - 12 - 5 = 33
    expect(margemBrl).toBeCloseTo(33);
    expect(margemPct).toBeCloseTo(33);
  });

  it('detecta margem negativa (venda com prejuízo)', () => {
    const { margemBrl } = calcMargin(60, 50, 12, 5);
    // 60 - 50 - 7.2 - 5 = -2.2
    expect(margemBrl).toBeLessThan(0);
  });
});

describe('calcRentabilidadeIndex', () => {
  it('retorna 0 quando não há margem calculável', () => {
    expect(calcRentabilidadeIndex(null, 10)).toBe(0);
  });

  it('produz índice maior para margem e giro maiores', () => {
    const low = calcRentabilidadeIndex(5, 2);
    const high = calcRentabilidadeIndex(35, 50);
    expect(high).toBeGreaterThan(low);
  });
});

describe('buildProfitability', () => {
  it('ignora produtos sem custo cadastrado (dado insuficiente, não inventa)', () => {
    const products = [erp({ precoCusto: null })];
    const result = buildProfitability(products, []);
    expect(result).toHaveLength(0);
  });

  it('calcula margem por canal e escolhe o melhor', () => {
    const products = [erp({})];
    const listings = [
      listing({ source: 'mercadolivre', price: 100, soldQuantity: 20 }),
      listing({ itemId: 'SH1', source: 'shopee', price: 90, soldQuantity: 5 }),
    ];
    const result = buildProfitability(products, listings);
    expect(result).toHaveLength(1);
    expect(result[0].melhorCanal).toBe('mercadolivre');
    expect(result[0].margemMlBrl).not.toBeNull();
    expect(result[0].margemShopeeBrl).not.toBeNull();
  });

  it('marca como prejudicial quando margem líquida é negativa', () => {
    const products = [erp({ precoCusto: 95 })];
    const listings = [listing({ price: 100 })];
    const result = buildProfitability(products, listings);
    // 100 - 95 - 12 - 5 = -12 => prejuízo
    expect(result[0].prejudicial).toBe(true);
  });
});

describe('simulatePrice / priceForTargetMargin', () => {
  it('simula um novo preço e recalcula a margem', () => {
    const { margemPct } = simulatePrice(50, 120, 'mercadolivre', DEFAULT_FEES);
    expect(margemPct).toBeGreaterThan(0);
  });

  it('encontra o preço mínimo para uma margem-alvo e essa margem é atingida de fato', () => {
    const preco = priceForTargetMargin(50, 20, 'mercadolivre', DEFAULT_FEES);
    const { margemPct } = simulatePrice(50, preco, 'mercadolivre', DEFAULT_FEES);
    expect(margemPct).toBeCloseTo(20, 0);
  });
});

describe('calcCurvaAbc', () => {
  it('classifica produtos em A/B/C pela participação acumulada na receita', () => {
    const products = buildProfitability(
      [erp({ sku: 'A', precoCusto: 10 }), erp({ sku: 'B', precoCusto: 10 }), erp({ sku: 'C', precoCusto: 10 })],
      [
        listing({ sku: 'A', price: 1000, soldQuantity: 100 }),
        listing({ itemId: 'B1', sku: 'B', price: 100, soldQuantity: 10 }),
        listing({ itemId: 'C1', sku: 'C', price: 10, soldQuantity: 1 }),
      ]
    );
    const abc = calcCurvaAbc(products);
    expect(abc[0].sku).toBe('A');
    expect(abc[0].classe).toBe('A');
    expect(abc[abc.length - 1].classe).toBe('C');
  });
});
