/**
 * Relatórios — Capítulo 9 do Documento Mestre.
 *
 * Exportação real (CSV compatível com Excel, e impressão em PDF via
 * window.print() com layout dedicado) — sem dependências novas, sem dados
 * fictícios: opera sobre os arrays já calculados por financial.ts/intelligence.ts.
 */

export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const header = columns.map((c) => escapeCsv(c.label)).join(';');
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsv(formatValue(row[c.key]))).join(';')
  );
  return [header, ...lines].join('\n');
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
  return String(value);
}

function escapeCsv(value: string): string {
  if (value.includes(';') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function downloadCsv(filename: string, csvContent: string): void {
  // Prefixo BOM garante acentuação correta ao abrir no Excel.
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
