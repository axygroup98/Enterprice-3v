import { useEffect, useMemo, useState } from 'react';
import { TrendingDown, TrendingUp, DollarSign, AlertTriangle } from 'lucide-react';
import { getErpProducts, getMarketplaceListings } from '../lib/integrations';
import { getConfig } from '../lib/supabase';
import {
  buildProfitability, calcCurvaAbc, simulatePrice, priceForTargetMargin,
  ProductProfitability, MarketplaceFees, DEFAULT_FEES,
} from '../lib/financial';

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function Financeiro() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductProfitability[]>([]);
  const [fees, setFees] = useState<MarketplaceFees>(DEFAULT_FEES);
  const [selected, setSelected] = useState<ProductProfitability | null>(null);
  const [simPrice, setSimPrice] = useState<number>(0);
  const [simMarketplace, setSimMarketplace] = useState<'mercadolivre' | 'shopee'>('mercadolivre');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [mlPct, shopeePct, fixed] = await Promise.all([
          getConfig('fee_mercadolivre_pct'),
          getConfig('fee_shopee_pct'),
          getConfig('fee_fixed_brl'),
        ]);
        const loadedFees: MarketplaceFees = {
          mercadolivrePct: parseFloat(mlPct) || DEFAULT_FEES.mercadolivrePct,
          shopeePct: parseFloat(shopeePct) || DEFAULT_FEES.shopeePct,
          fixedBrl: parseFloat(fixed) || DEFAULT_FEES.fixedBrl,
        };
        setFees(loadedFees);

        const erp = await getErpProducts();
        const listings = await getMarketplaceListings(erp);
        setProducts(buildProfitability(erp, listings, loadedFees));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar dados financeiros.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const abc = useMemo(() => calcCurvaAbc(products), [products]);
  const prejudiciais = useMemo(() => products.filter((p) => p.prejudicial), [products]);
  const totalRentabilidade = useMemo(
    () => (products.length ? Math.round(products.reduce((s, p) => s + p.indiceRentabilidade, 0) / products.length) : 0),
    [products]
  );

  function openSimulator(p: ProductProfitability) {
    setSelected(p);
    setSimMarketplace(p.melhorCanal ?? 'mercadolivre');
    setSimPrice(p.precoMl ?? p.precoShopee ?? p.custo * 1.5);
  }

  const simResult = selected ? simulatePrice(selected.custo, simPrice, simMarketplace, fees) : null;
  const targetPrice20 = selected ? priceForTargetMargin(selected.custo, 20, simMarketplace, fees) : null;

  if (loading) {
    return <div className="text-sm text-gray-400 py-12 text-center">Carregando dados financeiros...</div>;
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">
        {error} — verifique se as integrações Bling/Mercado Livre/Shopee estão configuradas em Integrar.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Rentabilidade real por produto, calculada a partir do custo do Bling e do preço praticado nos marketplaces.
        Comissões: ML {fees.mercadolivrePct}% · Shopee {fees.shopeePct}% · taxa fixa {BRL(fees.fixedBrl)} (ajustável em Administrar).
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-2"><DollarSign className="h-4 w-4" /> Índice de Rentabilidade CIO (médio)</div>
          <p className="text-3xl font-bold text-slate-800">{totalRentabilidade}</p>
        </div>
        <div className="bg-white rounded-xl border border-red-200 p-5">
          <div className="flex items-center gap-2 text-red-500 text-xs font-medium mb-2"><AlertTriangle className="h-4 w-4" /> Produtos prejudiciais (margem negativa)</div>
          <p className="text-3xl font-bold text-red-600">{prejudiciais.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-2"><TrendingUp className="h-4 w-4" /> Produtos com custo cadastrado</div>
          <p className="text-3xl font-bold text-slate-800">{products.length}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 font-semibold text-sm text-gray-900">Rentabilidade por Produto</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="px-5 py-2">Produto</th>
                <th className="px-5 py-2">Custo</th>
                <th className="px-5 py-2">Margem ML</th>
                <th className="px-5 py-2">Margem Shopee</th>
                <th className="px-5 py-2">Índice CIO</th>
                <th className="px-5 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.sku} className={`border-b border-gray-50 ${p.prejudicial ? 'bg-red-50/50' : ''}`}>
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-gray-900">{p.name}</p>
                    <p className="text-xs text-gray-400">{p.sku}</p>
                  </td>
                  <td className="px-5 py-2.5">{BRL(p.custo)}</td>
                  <td className="px-5 py-2.5">
                    {p.margemMlPct != null ? (
                      <span className={p.margemMlPct < 0 ? 'text-red-600 font-medium' : 'text-emerald-600'}>
                        {p.margemMlPct.toFixed(1)}% ({BRL(p.margemMlBrl ?? 0)})
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-2.5">
                    {p.margemShopeePct != null ? (
                      <span className={p.margemShopeePct < 0 ? 'text-red-600 font-medium' : 'text-emerald-600'}>
                        {p.margemShopeePct.toFixed(1)}% ({BRL(p.margemShopeeBrl ?? 0)})
                      </span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-5 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${p.indiceRentabilidade >= 60 ? 'bg-emerald-100 text-emerald-700' : p.indiceRentabilidade >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                      {p.indiceRentabilidade}
                    </span>
                  </td>
                  <td className="px-5 py-2.5">
                    <button onClick={() => openSimulator(p)} className="text-xs font-medium text-blue-600 hover:text-blue-800">Simular preço</button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">Nenhum produto com custo cadastrado no Bling.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 font-semibold text-sm text-gray-900">Curva ABC (participação na receita)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="px-5 py-2">Produto</th>
                <th className="px-5 py-2">Receita estimada</th>
                <th className="px-5 py-2">Participação</th>
                <th className="px-5 py-2">Acumulado</th>
                <th className="px-5 py-2">Classe</th>
              </tr>
            </thead>
            <tbody>
              {abc.map((a) => (
                <tr key={a.sku} className="border-b border-gray-50">
                  <td className="px-5 py-2.5 font-medium text-gray-900">{a.name}</td>
                  <td className="px-5 py-2.5">{BRL(a.receita)}</td>
                  <td className="px-5 py-2.5">{a.participacaoPct.toFixed(1)}%</td>
                  <td className="px-5 py-2.5">{a.participacaoAcumuladaPct.toFixed(1)}%</td>
                  <td className="px-5 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${a.classe === 'A' ? 'bg-emerald-100 text-emerald-700' : a.classe === 'B' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{a.classe}</span>
                  </td>
                </tr>
              ))}
              {abc.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-400">Sem dados de venda suficientes.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && simResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Simulador de Preços — {selected.name}</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="flex gap-2">
              {(['mercadolivre', 'shopee'] as const).map((m) => (
                <button key={m} onClick={() => setSimMarketplace(m)} className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${simMarketplace === m ? 'bg-slate-800 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {m === 'mercadolivre' ? 'Mercado Livre' : 'Shopee'}
                </button>
              ))}
            </div>
            <label className="block text-xs text-gray-500">Novo preço de venda</label>
            <input
              type="number" value={simPrice} onChange={(e) => setSimPrice(parseFloat(e.target.value) || 0)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <div className={`rounded-lg p-4 ${simResult.margemBrl >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
              <p className="text-xs text-gray-500 mb-1">Margem líquida estimada</p>
              <p className={`text-2xl font-bold ${simResult.margemBrl >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {BRL(simResult.margemBrl)} ({simResult.margemPct.toFixed(1)}%)
              </p>
              <div className="flex items-center gap-1 text-xs mt-1 text-gray-500">
                {simResult.margemBrl >= 0 ? <TrendingUp className="h-3 w-3 text-emerald-600" /> : <TrendingDown className="h-3 w-3 text-red-600" />}
                Custo {BRL(selected.custo)} · comissão {simMarketplace === 'mercadolivre' ? fees.mercadolivrePct : fees.shopeePct}% · taxa fixa {BRL(fees.fixedBrl)}
              </div>
            </div>
            {targetPrice20 != null && isFinite(targetPrice20) && (
              <p className="text-xs text-gray-500">Preço mínimo para 20% de margem: <span className="font-semibold text-gray-800">{BRL(targetPrice20)}</span></p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
