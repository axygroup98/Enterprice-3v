import { Divergence, OrderMonitor } from '../types';
import { ProductProfitability } from './financial';

/**
 * Motor de Inteligência — Capítulo 8 do Documento Mestre.
 *
 * Regra de ouro do documento (2.16 / 8.6): nunca responder apenas "o que",
 * sempre "por que aconteceu", "qual prioridade" e "quanto dinheiro representa".
 * Função pura: recebe dados já coletados por outras camadas (divergências,
 * rentabilidade, pedidos) e produz recomendações explicáveis — sem nenhuma
 * chamada de API nova.
 */

export type RecommendationCategory = 'comercial' | 'operacional' | 'financeiro' | 'marketplace';
export type RecommendationPriority = 'critical' | 'high' | 'medium' | 'informative';

export interface Recommendation {
  id: string;
  sku: string | null;
  category: RecommendationCategory;
  title: string;
  cause: string; // "por que aconteceu"
  impact: string; // "qual o impacto" (texto)
  impactValue: number; // "quanto dinheiro isso representa" (R$/mês estimado)
  priority: RecommendationPriority;
  suggestedAction: string; // "como resolver"
}

const PRIORITY_WEIGHT: Record<RecommendationPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  informative: 1,
};

export function sortByPriorityThenValue(recs: Recommendation[]): Recommendation[] {
  return [...recs].sort((a, b) => {
    const p = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (p !== 0) return p;
    return b.impactValue - a.impactValue;
  });
}

/** 7.10/8.11 — Recomendações operacionais a partir de divergências ERP × Marketplace. */
export function fromDivergences(divergences: Divergence[]): Recommendation[] {
  return divergences
    .filter((d) => !d.resolved && !d.ignored)
    .map((d) => {
      const estimatedMonthlyLoss = estimateDivergenceImpact(d);
      return {
        id: `div_${d.id}`,
        sku: d.sku,
        category: 'operacional' as const,
        title: `${d.product_name} — ${labelForType(d.divergence_type)}`,
        cause: causeForDivergence(d),
        impact: impactTextForDivergence(d),
        impactValue: estimatedMonthlyLoss,
        priority: d.priority,
        suggestedAction: d.recommended_action,
      };
    });
}

function labelForType(type: Divergence['divergence_type']): string {
  const map: Record<string, string> = {
    stock: 'divergência de estoque',
    title: 'divergência de título',
    status: 'divergência de status',
    photo: 'sem foto',
    description: 'sem descrição',
    price: 'divergência de preço',
    orphan: 'anúncio órfão',
    unlinked_sku: 'SKU não vinculado',
  };
  return map[type] ?? type;
}

function causeForDivergence(d: Divergence): string {
  switch (d.divergence_type) {
    case 'stock':
      return `O ERP (Bling, fonte da verdade) informa estoque diferente do anunciado no ${d.marketplace === 'mercadolivre' ? 'Mercado Livre' : 'Shopee'} — a sincronização mais recente não foi aplicada ou houve venda não refletida.`;
    case 'orphan':
      return 'Existe um anúncio ativo no marketplace sem produto correspondente cadastrado no ERP, geralmente por SKU digitado incorretamente ou produto removido do Bling.';
    case 'price':
      return 'O preço praticado no marketplace não corresponde ao preço de tabela do ERP.';
    case 'photo':
      return 'Produto cadastrado no ERP sem nenhuma foto associada, o que reduz conversão nos marketplaces.';
    case 'description':
      return 'Produto sem descrição complementar no ERP, prejudicando a qualidade do anúncio gerado a partir dele.';
    default:
      return 'Divergência identificada entre o ERP e o marketplace durante a conciliação automática.';
  }
}

function impactTextForDivergence(d: Divergence): string {
  if (d.divergence_type === 'stock' && d.ml_value === '0') {
    return 'Risco de venda com estoque zerado (overselling) ou anúncio pausado indevidamente, gerando cancelamentos e penalização de reputação no marketplace.';
  }
  if (d.divergence_type === 'orphan') {
    return 'Vendas deste anúncio não entram no ERP automaticamente, gerando ruptura de estoque physical/fiscal.';
  }
  return 'Impacta a confiabilidade da vitrine e pode gerar decisões erradas de reposição/precificação.';
}

/** Estimativa conservadora de impacto financeiro mensal por tipo/prioridade — usada apenas
 * para priorização relativa, não como valor contábil exato (não há dado de venda futura). */
function estimateDivergenceImpact(d: Divergence): number {
  const base = d.priority === 'critical' ? 600 : d.priority === 'high' ? 300 : d.priority === 'medium' ? 120 : 30;
  const multiplier = d.divergence_type === 'stock' || d.divergence_type === 'orphan' ? 1.5 : 1;
  return Math.round(base * multiplier);
}

/** 6.10/8.11 — Recomendações financeiras a partir da rentabilidade por produto. */
export function fromProfitability(products: ProductProfitability[]): Recommendation[] {
  const recs: Recommendation[] = [];
  for (const p of products) {
    if (p.prejudicial) {
      const piorMargem = Math.min(p.margemMlBrl ?? 0, p.margemShopeeBrl ?? 0);
      const perdaMensalEstimada = Math.abs(piorMargem) * Math.max(1, p.soldQuantityMl);
      recs.push({
        id: `fin_prej_${p.sku}`,
        sku: p.sku,
        category: 'financeiro',
        title: `${p.name} está sendo vendido com prejuízo`,
        cause: `Custo de R$ ${p.custo.toFixed(2)} não é coberto pelo preço praticado após comissão do marketplace.`,
        impact: 'Cada unidade vendida reduz o lucro da operação em vez de gerar receita.',
        impactValue: Math.round(perdaMensalEstimada),
        priority: 'critical',
        suggestedAction: `Reajustar preço no canal com pior margem para ao menos cobrir custo + comissão + taxa fixa (ver Simulador de Preços).`,
      });
    } else if (p.indiceRentabilidade < 40 && (p.margemMlPct != null || p.margemShopeePct != null)) {
      recs.push({
        id: `fin_low_${p.sku}`,
        sku: p.sku,
        category: 'financeiro',
        title: `${p.name} com baixa rentabilidade (Índice CIO ${p.indiceRentabilidade})`,
        cause: 'Margem líquida próxima do limite ou giro de vendas baixo no período analisado.',
        impact: 'Produto ocupa capital de giro e espaço no marketplace sem retorno proporcional.',
        impactValue: Math.round((p.precoMl ?? p.precoShopee ?? 0) * 0.05 * Math.max(1, p.soldQuantityMl)),
        priority: 'medium',
        suggestedAction: 'Avaliar reposicionamento de preço ou reforço de mídia para aumentar o giro.',
      });
    }
  }
  return recs;
}

/** 7.10 — Recomendações a partir de pedidos parados (SLA operacional). */
export function fromStoppedOrders(orders: OrderMonitor[]): Recommendation[] {
  return orders
    .filter((o) => o.status === 'stopped')
    .map((o) => ({
      id: `ord_${o.id}`,
      sku: null,
      category: 'operacional' as const,
      title: `Pedido ${o.id} parado há ${o.daysStopped ?? '?'} dia(s)`,
      cause: 'Pedido sem atualização de status por mais de 48h — possível falha de separação/expedição ou emissão de NF pendente.',
      impact: 'Risco de cancelamento pelo cliente, reclamação e impacto na reputação do vendedor no marketplace.',
      impactValue: Math.round(o.total),
      priority: (o.daysStopped ?? 0) > 5 ? 'critical' : 'high',
      suggestedAction: 'Verificar o pedido no ERP e no marketplace de origem e desbloquear a etapa travada.',
    }));
}

export function generateRecommendations(input: {
  divergences: Divergence[];
  profitability: ProductProfitability[];
  stoppedOrders: OrderMonitor[];
}): Recommendation[] {
  const all = [
    ...fromDivergences(input.divergences),
    ...fromProfitability(input.profitability),
    ...fromStoppedOrders(input.stoppedOrders),
  ];
  return sortByPriorityThenValue(all);
}
