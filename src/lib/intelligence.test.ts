import { describe, it, expect } from 'vitest';
import { fromDivergences, fromProfitability, fromStoppedOrders, generateRecommendations, sortByPriorityThenValue } from './intelligence';
import { Divergence, OrderMonitor } from '../types';
import { ProductProfitability } from './financial';

function divergence(overrides: Partial<Divergence>): Divergence {
  return {
    id: 'd1', created_at: '', updated_at: '', product_name: 'Produto X', sku: 'SKU1',
    divergence_type: 'stock', priority: 'critical', erp_value: '10', ml_value: '0',
    shopee_value: null, recommended_action: 'Sincronizar estoque', marketplace: 'mercadolivre',
    ml_item_id: 'ML1', shopee_item_id: null, resolved: false, resolved_at: null, ignored: false,
    ...overrides,
  };
}

function profitability(overrides: Partial<ProductProfitability>): ProductProfitability {
  return {
    sku: 'SKU1', name: 'Produto X', custo: 50, precoErp: 100, precoMl: 100, precoShopee: null,
    soldQuantityMl: 10, margemMlPct: 30, margemShopeePct: null, margemMlBrl: 30, margemShopeeBrl: null,
    melhorCanal: 'mercadolivre', prejudicial: false, indiceRentabilidade: 70,
    ...overrides,
  };
}

describe('fromDivergences', () => {
  it('gera recomendação explicável com causa, impacto e ação para cada divergência aberta', () => {
    const recs = fromDivergences([divergence({})]);
    expect(recs).toHaveLength(1);
    expect(recs[0].cause).toMatch(/Bling/);
    expect(recs[0].impactValue).toBeGreaterThan(0);
    expect(recs[0].suggestedAction).toBe('Sincronizar estoque');
  });

  it('ignora divergências já resolvidas ou ignoradas', () => {
    const recs = fromDivergences([divergence({ resolved: true }), divergence({ ignored: true })]);
    expect(recs).toHaveLength(0);
  });
});

describe('fromProfitability', () => {
  it('gera alerta crítico para produto vendido com prejuízo, com valor estimado em R$', () => {
    const recs = fromProfitability([profitability({ prejudicial: true, margemMlBrl: -12, soldQuantityMl: 10 })]);
    expect(recs).toHaveLength(1);
    expect(recs[0].priority).toBe('critical');
    expect(recs[0].impactValue).toBeGreaterThan(0);
  });

  it('não gera alerta para produto saudável', () => {
    const recs = fromProfitability([profitability({ indiceRentabilidade: 85 })]);
    expect(recs).toHaveLength(0);
  });
});

describe('fromStoppedOrders', () => {
  it('prioriza como crítico pedidos parados há mais de 5 dias', () => {
    const order: OrderMonitor = {
      id: 'P1', marketplace: 'mercadolivre', status: 'stopped', buyerName: 'Cliente',
      total: 250, createdAt: '', updatedAt: '', daysStopped: 7,
    };
    const recs = fromStoppedOrders([order]);
    expect(recs[0].priority).toBe('critical');
    expect(recs[0].impactValue).toBe(250);
  });
});

describe('sortByPriorityThenValue / generateRecommendations', () => {
  it('ordena por prioridade e, em empate, por valor de impacto', () => {
    const recs = sortByPriorityThenValue([
      { id: '1', sku: null, category: 'operacional', title: '', cause: '', impact: '', impactValue: 100, priority: 'medium', suggestedAction: '' },
      { id: '2', sku: null, category: 'operacional', title: '', cause: '', impact: '', impactValue: 50, priority: 'critical', suggestedAction: '' },
      { id: '3', sku: null, category: 'operacional', title: '', cause: '', impact: '', impactValue: 500, priority: 'critical', suggestedAction: '' },
    ]);
    expect(recs.map((r) => r.id)).toEqual(['3', '2', '1']);
  });

  it('agrega recomendações operacionais e financeiras de todas as fontes', () => {
    const recs = generateRecommendations({
      divergences: [divergence({})],
      profitability: [profitability({ prejudicial: true, margemMlBrl: -5 })],
      stoppedOrders: [],
    });
    expect(recs.length).toBe(2);
    expect(recs.some((r) => r.category === 'operacional')).toBe(true);
    expect(recs.some((r) => r.category === 'financeiro')).toBe(true);
  });
});
