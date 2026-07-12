import { useEffect, useState } from 'react';
import { FileDown, Printer, BarChart3 } from 'lucide-react';
import { getErpProducts, getMarketplaceListings } from '../lib/integrations';
import { buildProfitability, calcCurvaAbc, ProductProfitability, AbcEntry } from '../lib/financial';
import { toCsv, downloadCsv } from '../lib/reports';

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function Relatorios() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductProfitability[]>([]);
  const [abc, setAbc] = useState<AbcEntry[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const erp = await getErpProducts();
        const listings = await getMarketplaceListings(erp);
        const prof = buildProfitability(erp, listings);
        setProducts(prof);
        setAbc(calcCurvaAbc(prof));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Falha ao carregar dados para relatório.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function exportRentabilidadeCsv() {
    const csv = toCsv(
      products as unknown as Record<string, unknown>[],
      [
        { key: 'sku', label: 'SKU' },
        { key: 'name', label: 'Produto' },
        { key: 'custo', label: 'Custo' },
        { key: 'precoMl', label: 'Preço ML' },
        { key: 'margemMlPct', label: 'Margem ML %' },
        { key: 'precoShopee', label: 'Preço Shopee' },
        { key: 'margemShopeePct', label: 'Margem Shopee %' },
        { key: 'indiceRentabilidade', label: 'Índice CIO' },
      ]
    );
    downloadCsv(`rentabilidade_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  function exportAbcCsv() {
    const csv = toCsv(
      abc as unknown as Record<string, unknown>[],
      [
        { key: 'sku', label: 'SKU' },
        { key: 'name', label: 'Produto' },
        { key: 'receita', label: 'Receita' },
        { key: 'participacaoPct', label: 'Participação %' },
        { key: 'participacaoAcumuladaPct', label: 'Acumulado %' },
        { key: 'classe', label: 'Classe' },
      ]
    );
    downloadCsv(`curva_abc_${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Relatórios executivos gerados a partir dos dados reais já sincronizados (nenhum dado é inventado).
        Exportação em CSV (compatível com Excel) e impressão em PDF pelo navegador.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 print:hidden">
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900 text-sm">Rentabilidade por Produto</p>
            <p className="text-xs text-gray-500 mt-0.5">{products.length} produto(s)</p>
          </div>
          <button onClick={exportRentabilidadeCsv} disabled={loading || products.length === 0} className="flex items-center gap-2 text-xs font-medium bg-slate-800 text-white px-3 py-2 rounded-lg disabled:opacity-40">
            <FileDown className="h-4 w-4" /> Exportar CSV
          </button>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
          <div>
            <p className="font-semibold text-gray-900 text-sm">Curva ABC</p>
            <p className="text-xs text-gray-500 mt-0.5">{abc.length} produto(s)</p>
          </div>
          <button onClick={exportAbcCsv} disabled={loading || abc.length === 0} className="flex items-center gap-2 text-xs font-medium bg-slate-800 text-white px-3 py-2 rounded-lg disabled:opacity-40">
            <FileDown className="h-4 w-4" /> Exportar CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 print:hidden">
        <button onClick={() => window.print()} className="flex items-center gap-2 text-xs font-medium bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200">
          <Printer className="h-4 w-4" /> Imprimir Relatório Executivo (PDF)
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 font-semibold text-sm text-gray-900 flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Resumo Executivo — Curva ABC
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="px-5 py-2">Produto</th>
                <th className="px-5 py-2">Receita</th>
                <th className="px-5 py-2">Participação</th>
                <th className="px-5 py-2">Classe</th>
              </tr>
            </thead>
            <tbody>
              {abc.map((a) => (
                <tr key={a.sku} className="border-b border-gray-50">
                  <td className="px-5 py-2.5 font-medium text-gray-900">{a.name}</td>
                  <td className="px-5 py-2.5">{BRL(a.receita)}</td>
                  <td className="px-5 py-2.5">{a.participacaoPct.toFixed(1)}%</td>
                  <td className="px-5 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${a.classe === 'A' ? 'bg-emerald-100 text-emerald-700' : a.classe === 'B' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{a.classe}</span>
                  </td>
                </tr>
              ))}
              {!loading && abc.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-gray-400">Sem dados suficientes de venda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
