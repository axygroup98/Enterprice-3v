import { useEffect, useMemo, useState } from 'react';
import { Brain, AlertOctagon, DollarSign, CheckCircle2, ArrowRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getErpProducts, getMarketplaceListings, getOrderMonitorData } from '../lib/integrations';
import { buildProfitability } from '../lib/financial';
import { generateRecommendations, Recommendation, RecommendationCategory } from '../lib/intelligence';
import { Divergence, OrderMonitor } from '../types';

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const CATEGORY_LABEL: Record<RecommendationCategory, string> = {
  comercial: 'Comercial',
  operacional: 'Operacional',
  financeiro: 'Financeiro',
  marketplace: 'Marketplace',
};

const PRIORITY_STYLE: Record<Recommendation['priority'], string> = {
  critical: 'bg-red-50 border-red-200 text-red-700',
  high: 'bg-orange-50 border-orange-200 text-orange-700',
  medium: 'bg-amber-50 border-amber-200 text-amber-700',
  informative: 'bg-blue-50 border-blue-200 text-blue-700',
};

export function Inteligencia() {
  const [loading, setLoading] = useState(true);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [filter, setFilter] = useState<RecommendationCategory | 'all'>('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      setLoading(true);
      const divRes = await supabase.from('divergences').select('*').eq('resolved', false).eq('ignored', false);
      const divergences = (divRes.data ?? []) as Divergence[];

      let orders: OrderMonitor[] = [];
      let profitability: ReturnType<typeof buildProfitability> = [];
      try {
        const erp = await getErpProducts();
        const [listings, ord] = await Promise.all([getMarketplaceListings(erp), getOrderMonitorData()]);
        profitability = buildProfitability(erp, listings);
        orders = ord;
      } catch (err) {
        console.error(err);
      }

      setRecs(generateRecommendations({ divergences, profitability, stoppedOrders: orders }));
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => (filter === 'all' ? recs : recs.filter((r) => r.category === filter)), [recs, filter]);
  const totalImpact = useMemo(() => recs.reduce((s, r) => s + r.impactValue, 0), [recs]);
  const critical = useMemo(() => recs.filter((r) => r.priority === 'critical').length, [recs]);

  async function acceptAsTask(rec: Recommendation) {
    setSavingId(rec.id);
    const { error } = await supabase.from('execution_tasks').insert({
      source_type: rec.category === 'financeiro' ? 'financial' : 'divergence',
      source_id: rec.id,
      title: rec.title,
      description: `${rec.cause} ${rec.impact}`,
      priority: rec.priority,
      impact_value: rec.impactValue,
      status: 'pending',
    });
    if (!error) {
      setAcceptedIds((prev) => new Set(prev).add(rec.id));
      await supabase.from('recommendations').insert({
        sku: rec.sku,
        category: rec.category,
        cause: rec.cause,
        impact_value: rec.impactValue,
        priority: rec.priority,
        suggested_action: rec.suggestedAction,
        status: 'accepted',
      });
    }
    setSavingId(null);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Motor de Inteligência: para cada situação, o sistema explica <b>o que</b> aconteceu, <b>por que</b>, <b>qual prioridade</b> e <b>quanto dinheiro</b> representa — nunca apenas exibe dados brutos.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-2"><Brain className="h-4 w-4" /> Recomendações ativas</div>
          <p className="text-3xl font-bold text-slate-800">{recs.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-5">
          <div className="flex items-center gap-2 text-red-500 text-xs font-medium mb-2"><AlertOctagon className="h-4 w-4" /> Prioridade crítica</div>
          <p className="text-3xl font-bold text-red-600">{critical}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-2"><DollarSign className="h-4 w-4" /> Impacto financeiro estimado</div>
          <p className="text-3xl font-bold text-slate-800">{BRL(totalImpact)}</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(['all', 'operacional', 'financeiro', 'comercial', 'marketplace'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium ${filter === f ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {f === 'all' ? 'Todas' : CATEGORY_LABEL[f]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-12 text-center">Analisando dados...</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((r) => (
            <div key={r.id} className={`rounded-xl border p-4 ${PRIORITY_STYLE[r.priority]}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] uppercase font-bold tracking-wide opacity-70">{CATEGORY_LABEL[r.category]}</span>
                    <span className="text-[10px] uppercase font-bold tracking-wide opacity-70">· {r.priority}</span>
                  </div>
                  <p className="font-semibold text-gray-900">{r.title}</p>
                  <p className="text-sm mt-1"><span className="font-medium">Por quê:</span> {r.cause}</p>
                  <p className="text-sm mt-1"><span className="font-medium">Impacto:</span> {r.impact}</p>
                  <p className="text-sm mt-1"><span className="font-medium">Como resolver:</span> {r.suggestedAction}</p>
                </div>
                <div className="text-right flex-shrink-0 space-y-2">
                  <p className="text-xs opacity-70">Valor estimado</p>
                  <p className="font-bold text-lg">{BRL(r.impactValue)}</p>
                  {acceptedIds.has(r.id) ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Na Execução</span>
                  ) : (
                    <button
                      disabled={savingId === r.id}
                      onClick={() => acceptAsTask(r)}
                      className="inline-flex items-center gap-1 text-xs font-medium bg-slate-800 text-white px-3 py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-50"
                    >
                      Enviar p/ Execução <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">Nenhuma recomendação nesta categoria.</div>
          )}
        </div>
      )}
    </div>
  );
}
