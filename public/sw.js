const CACHE = 'lebon-stock-only-__BUILD_VERSION__';
const ASSETS = /* ASSETS */ [];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));
  // Updates activate after all old tabs close, preserving unsaved forms.
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('lebon-stock-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(fetch(request,{cache:'no-cache'}).catch(()=>caches.match('/index.html')));
  }else if(ASSETS.includes(url.pathname)){
    event.respondWith(caches.match(request,{ignoreSearch:true}).then(hit=>hit||fetch(request)));
  }
});
