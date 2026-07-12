import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  test: {
    // Edge Functions (supabase/functions/**) usam Deno.test/imports https://deno.land
    // e rodam sob `deno test` (script `test:edge`), não sob Vitest/Node.
    exclude: ['node_modules/**', 'supabase/functions/**'],
  },
});
