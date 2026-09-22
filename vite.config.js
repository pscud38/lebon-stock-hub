import { defineConfig } from 'vite';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
export default defineConfig({
  build:{target:'es2022'},
  plugins:[{
    name:'inventory-offline-manifest',
    closeBundle(){
      if(!existsSync('dist/assets'))return;
      const assets=readdirSync('dist/assets').map(x=>'/assets/'+x);
      const version=createHash('sha256').update(assets.join('|')+readFileSync('dist/index.html')).digest('hex').slice(0,12);
      const sw=readFileSync('dist/sw.js','utf8').replace('__BUILD_VERSION__',version)
        .replace('/* ASSETS */ []',JSON.stringify(['/', '/index.html','/manifest.json','/icon.svg',...assets]));
      writeFileSync('dist/sw.js',sw);
    }
  }]
});
