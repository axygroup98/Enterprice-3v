import { useEffect, useState, useCallback } from 'react';
import {
  RefreshCw, CheckCircle, AlertTriangle,
  Search, Filter, ArrowRight, Package, ShoppingBag, Tag,
} from 'lucide-react';
import { computeLocalDivergences, LocalDivergence } from '../lib/integrations';
import { PriorityBadge } from '../components/PriorityBadge';

const SEVERITY_LABELS: Record<string, string> = {
  critical: 'Crítico', high: 'Alto', medium: 'Médio', informative: 'Informativo',
};

const TYPE_LABELS: Record<string, string> = {
  stock: 'Estoque', price: 'Preço', no_listing: 'Sem anúncio', orphan_listing: 'Anúncio fantasma',
};

const TYPE_ICONS: Record<string, React.ElementType> = {
  stock: Package, price: Tag, no_listing: AlertTriangle, orphan_listing: ShoppingBag,
};

export function Conciliation() {
  const [divergences, setDivergences] = useState<LocalDivergence[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const loadDivergences = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const divs = await computeLocalDivergences();
      setDivergences(divs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar divergências. Verifique as integrações em Administrar.');
      setDivergences([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadDivergences(); }, [loadDivergences]);

  const filtered = divergences.filter((d) => {
    if (severityFilter !== 'all' && d.severity !== severityFilter) return false;
    if (typeFilter !== 'all' && d.type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!d.productName.toLowerCase().includes(q) && !d.sku.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const countsBySeverity = {
    critical: divergences.filter((d) => d.severity === 'critical').length,
    high: divergences.filter((d) => d.severity === 'high').length,
    medium: divergences.filter((d) => d.severity === 'medium').length,
    informative: divergences.filter((d) => d.severity === 'informative').length,
  };

  const countsByType = {
    stock: divergences.filter((d) => d.type === 'stock').length,
    price: divergences.filter((d) => d.type === 'price').length,
    no_listing: divergences.filter((d) => d.type === 'no_listing').length,
    orphan_listing: divergences.filter((d) => d.type === 'orphan_listing').length,
  };

  return (
    <div className="space-y-6">
      {/* Summary indicators */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Divergências de Estoque" value={countsByType.stock} icon={Package} color="text-blue-700 bg-blue-50" />
        <SummaryCard label="Divergências de Preço" value={countsByType.price} icon={Tag} color="text-amber-700 bg-amber-50" />
        <SummaryCard label="Produtos sem anúncio" value={countsByType.no_listing} icon={AlertTriangle} color="text-orange-700 bg-orange-50" />
        <SummaryCard label="Anúncios fantasma" value={countsByType.orphan_listing} icon={ShoppingBag} color="text-red-700 bg-red-50" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            <span className="text-xs font-semibold text-red-700">{countsBySeverity.critical} Críticos</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg">
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            <span className="text-xs font-semibold text-orange-700">{countsBySeverity.high} Altos</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg">
            <span className="h-2 w-2 rounded-full bg-yellow-500" />
            <span className="text-xs font-semibold text-yellow-700">{countsBySeverity.medium} Médios</span>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
            <span className="h-2 w-2 rounded-full bg-blue-500" />
            <span className="text-xs font-semibold text-blue-700">{countsBySeverity.informative} Informativos</span>
          </div>
        </div>
        <button
          onClick={loadDivergences}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 bg-white rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Sincronizar
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar produto ou SKU..."
            className="pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
          />
        </div>
        <div className="flex items-center gap-1 text-gray-500">
          <Filter className="h-4 w-4" />
        </div>
        {(['all', 'critical', 'high', 'medium', 'informative'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setSeverityFilter(p)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              severityFilter === p
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
            }`}
          >
            {p === 'all' ? 'Todos' : SEVERITY_LABELS[p]}
          </button>
        ))}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Todos os tipos</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left text-xs font-semibold text-gray-500 px-4 py-3">Produto / SKU</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Tipo</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">ERP (Bling)</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3"></th>
                <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Mercado Livre</th>
                <th className="text-center text-xs font-semibold text-gray-500 px-3 py-3">Prioridade</th>
                <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Ação Recomendada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-48" /></td>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-4 bg-gray-200 rounded w-16" /></td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <CheckCircle className="h-12 w-12 text-green-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-gray-600">Nenhuma divergência encontrada</p>
                    <p className="text-xs text-gray-400 mt-1">Estoque e preço do Mercado Livre estão sincronizados com o ERP</p>
                  </td>
                </tr>
              ) : (
                filtered.map((div) => {
                  const Icon = TYPE_ICONS[div.type] ?? AlertTriangle;
                  return (
                    <tr
                      key={div.id}
                      className={`hover:bg-gray-50 transition-colors ${div.severity === 'critical' ? 'border-l-2 border-l-red-400' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-900 leading-snug">{div.productName}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{div.sku}</p>
                        {div.mlItemId && <p className="text-[10px] text-gray-400 font-mono mt-0.5">ML: {div.mlItemId}</p>}
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-700 bg-gray-100 px-2 py-0.5 rounded-full">
                          <Icon className="h-3 w-3" />
                          {TYPE_LABELS[div.type]}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className="text-sm font-semibold text-gray-900">{div.erpValue}</span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <ArrowRight className="h-4 w-4 text-gray-300 mx-auto" />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-sm font-medium ${
                          div.erpValue !== div.mlValue && div.type !== 'no_listing'
                            ? 'text-red-600'
                            : 'text-gray-500'
                        }`}>
                          {div.mlValue}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center">
                        <PriorityBadge priority={div.severity} size="sm" />
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-xs text-gray-600 leading-snug max-w-48">{div.recommendedAction}</p>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!loading && filtered.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-500">{filtered.length} divergência(s) exibida(s)</span>
            <span className="text-xs text-gray-400">ERP é sempre a fonte oficial</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: React.ElementType; color: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900 leading-none">{value}</p>
        <p className="text-xs text-gray-500 mt-1">{label}</p>
      </div>
    </div>
  );
}
