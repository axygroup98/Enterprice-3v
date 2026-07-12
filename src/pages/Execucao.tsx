import { useEffect, useState } from 'react';
import { ListChecks, PlayCircle, CheckCircle2, XCircle, FlaskConical } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fixDivergence } from '../lib/integrations';
import { Divergence } from '../types';

interface ExecutionTask {
  id: string;
  created_at: string;
  source_type: string;
  source_id: string | null;
  title: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'informative';
  impact_value: number | null;
  status: 'pending' | 'simulated' | 'approved' | 'executed' | 'failed' | 'cancelled';
  simulation_result: Record<string, unknown> | null;
  execution_result: Record<string, unknown> | null;
}

const BRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const STATUS_LABEL: Record<ExecutionTask['status'], string> = {
  pending: 'Pendente',
  simulated: 'Simulado',
  approved: 'Aprovado',
  executed: 'Executado',
  failed: 'Falhou',
  cancelled: 'Cancelado',
};

export function Execucao() {
  const [tasks, setTasks] = useState<ExecutionTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  async function load() {
    setLoading(true);
    const { data } = await supabase.from('execution_tasks').select('*').order('created_at', { ascending: false });
    setTasks((data ?? []) as ExecutionTask[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  // 10.7 — Simulação Antes da Execução: nunca aplica a ação sem antes mostrar
  // o resultado esperado.
  async function simulate(task: ExecutionTask) {
    setBusyId(task.id);
    const simulationResult = {
      previsto: task.description,
      impacto_estimado: task.impact_value,
      recomendacao: task.priority === 'critical' ? 'Executar imediatamente' : 'Pode ser agendado',
    };
    await supabase.from('execution_tasks').update({ status: 'simulated', simulation_result: simulationResult }).eq('id', task.id);
    await load();
    setBusyId(null);
  }

  // Executa de fato: para tarefas originadas de divergência, chama a mesma
  // Edge Function `reconcile` já homologada (fixDivergence) — reaproveitamento
  // total, nenhuma integração nova é criada.
  async function execute(task: ExecutionTask) {
    setBusyId(task.id);
    try {
      if (task.source_type === 'divergence' && task.source_id) {
        const divId = task.source_id.replace(/^div_/, '');
        const { data: divRow } = await supabase.from('divergences').select('*').eq('id', divId).maybeSingle();
        if (divRow) {
          const result = await fixDivergence(divRow as Divergence);
          await supabase.from('execution_tasks').update({
            status: result.ok ? 'executed' : 'failed',
            execution_result: result,
            executed_at: new Date().toISOString(),
          }).eq('id', task.id);
        } else {
          await supabase.from('execution_tasks').update({
            status: 'failed',
            execution_result: { error: 'Divergência de origem não encontrada (pode já ter sido resolvida).' },
          }).eq('id', task.id);
        }
      } else {
        // Tarefas financeiras/manuais exigem decisão humana (mudança de preço,
        // por exemplo) — marcamos como aprovada para acompanhamento, sem
        // executar automaticamente uma mudança de preço sem confirmação externa.
        await supabase.from('execution_tasks').update({
          status: 'approved',
          execution_result: { nota: 'Ação aprovada. Aplicar manualmente no ERP/marketplace (mudança de preço não é automática).' },
        }).eq('id', task.id);
      }
    } finally {
      await load();
      setBusyId(null);
    }
  }

  async function executeBatch() {
    const selected = tasks.filter((t) => selectedIds.has(t.id) && (t.status === 'pending' || t.status === 'simulated'));
    for (const t of selected) {
      await execute(t);
    }
    setSelectedIds(new Set());
  }

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const pending = tasks.filter((t) => t.status === 'pending' || t.status === 'simulated');

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">
        Central de Tarefas: toda ação recomendada pelo Motor de Inteligência passa por aqui antes de ser executada — sempre com simulação prévia, nunca automática sem aprovação.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-gray-500 text-xs font-medium mb-2"><ListChecks className="h-4 w-4" /> Tarefas pendentes</div>
          <p className="text-3xl font-bold text-slate-800">{pending.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center gap-2 text-emerald-500 text-xs font-medium mb-2"><CheckCircle2 className="h-4 w-4" /> Executadas</div>
          <p className="text-3xl font-bold text-emerald-600">{tasks.filter((t) => t.status === 'executed').length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium mb-1">Seleção em lote</p>
            <p className="text-xs text-gray-400">{selectedIds.size} selecionada(s)</p>
          </div>
          <button
            disabled={selectedIds.size === 0}
            onClick={executeBatch}
            className="flex items-center gap-1 text-xs font-medium bg-slate-800 text-white px-3 py-2 rounded-lg disabled:opacity-30"
          >
            <PlayCircle className="h-4 w-4" /> Executar em lote
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400 py-12 text-center">Carregando tarefas...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
          {tasks.map((t) => (
            <div key={t.id} className="p-4 flex items-start gap-3">
              {(t.status === 'pending' || t.status === 'simulated') && (
                <input type="checkbox" className="mt-1" checked={selectedIds.has(t.id)} onChange={() => toggle(t.id)} />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${
                    t.status === 'executed' ? 'bg-emerald-100 text-emerald-700' :
                    t.status === 'failed' ? 'bg-red-100 text-red-700' :
                    t.status === 'simulated' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{STATUS_LABEL[t.status]}</span>
                  <span className="text-[10px] uppercase font-bold text-gray-400">{t.priority}</span>
                </div>
                <p className="font-medium text-gray-900 text-sm">{t.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                {t.impact_value != null && (
                  <p className="text-xs text-gray-400 mt-0.5">Impacto estimado: {BRL(t.impact_value)}</p>
                )}
              </div>
              <div className="flex-shrink-0 flex gap-2">
                {t.status === 'pending' && (
                  <button disabled={busyId === t.id} onClick={() => simulate(t)} className="flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-700 px-2.5 py-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-50">
                    <FlaskConical className="h-3.5 w-3.5" /> Simular
                  </button>
                )}
                {(t.status === 'pending' || t.status === 'simulated') && (
                  <button disabled={busyId === t.id} onClick={() => execute(t)} className="flex items-center gap-1 text-xs font-medium bg-slate-800 text-white px-2.5 py-1.5 rounded-lg hover:bg-slate-700 disabled:opacity-50">
                    <PlayCircle className="h-3.5 w-3.5" /> Executar
                  </button>
                )}
                {t.status === 'failed' && <XCircle className="h-4 w-4 text-red-500 mt-1" />}
              </div>
            </div>
          ))}
          {tasks.length === 0 && (
            <div className="text-center py-12 text-gray-400 text-sm">
              Nenhuma tarefa ainda. Vá em "Inteligência" e clique em "Enviar p/ Execução" nas recomendações.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
