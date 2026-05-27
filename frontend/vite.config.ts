import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Spring Bootの静的ファイル配信ディレクトリへ直接出力
    outDir: 'src/main/resources/static',
    // ビルドのたびに古い出力ファイルを自動的に削除する
    emptyOutDir: true,
  }
});