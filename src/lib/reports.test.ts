import { describe, it, expect } from 'vitest';
import { toCsv } from './reports';

describe('toCsv', () => {
  it('gera CSV com cabeçalho traduzido e separador ; (padrão Excel BR)', () => {
    const csv = toCsv(
      [{ sku: 'A1', name: 'Produto A', preco: 19.9 }],
      [{ key: 'sku', label: 'SKU' }, { key: 'name', label: 'Nome' }, { key: 'preco', label: 'Preço' }]
    );
    const lines = csv.split('\n');
    expect(lines[0]).toBe('SKU;Nome;Preço');
    expect(lines[1]).toContain('A1;Produto A;19,9');
  });

  it('escapa valores com ; ou aspas', () => {
    const csv = toCsv([{ name: 'Produto; especial "raro"' }], [{ key: 'name', label: 'Nome' }]);
    expect(csv.split('\n')[1]).toBe('"Produto; especial ""raro"""');
  });

  it('trata valores nulos/indefinidos como célula vazia', () => {
    const csv = toCsv([{ name: null }], [{ key: 'name', label: 'Nome' }]);
    expect(csv.split('\n')[1]).toBe('');
  });
});
