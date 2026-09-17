/**
 * Feuille de style des sites clients.
 *
 * Elle est INTEGREE au document (pas de requete supplementaire) et pilotee
 * entierement par les variables produites par `resolveTheme`. Aucune chaine
 * fournie par un client n arrive ici : les couleurs sont validees par un
 * schema, les polices proviennent d une liste fermee.
 *
 * Objectif de performance : une page de site vitrine doit s afficher en un
 * seul aller-retour reseau, sans CSS bloquant externe.
 */
export const SITE_STYLESHEET = `
*,*::before,*::after{box-sizing:border-box}
*{margin:0}
html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
body{
  min-height:100dvh;font-family:var(--site-font-body);
  background:var(--site-bg);color:var(--site-fg);
  font-size:1rem;line-height:1.6;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
  overflow-x:clip;
}
img,svg,video{display:block;max-width:100%;height:auto}
a{color:inherit;text-decoration:none}
button,input,select,textarea{font:inherit;color:inherit}
h1,h2,h3,h4{font-family:var(--site-font-heading);font-weight:600;line-height:1.15;letter-spacing:-.02em;text-wrap:balance}
h1{font-size:var(--site-h1)}
h2{font-size:var(--site-h2)}
h3{font-size:var(--site-h3)}
p{text-wrap:pretty}
:focus-visible{outline:2px solid var(--site-accent);outline-offset:3px;border-radius:2px}
::selection{background:rgb(var(--site-accent-rgb)/.22)}

.skip{position:absolute;left:-9999px;top:0;z-index:100;padding:.75rem 1rem;background:var(--site-accent);color:var(--site-accent-fg);border-radius:0 0 var(--site-radius-sm) 0}
.skip:focus{left:0}

.wrap{width:100%;margin-inline:auto;padding-inline:1.25rem}
@media (min-width:640px){.wrap{padding-inline:2rem}}
.w-narrow{max-width:46rem}
.w-default{max-width:68rem}
.w-wide{max-width:82rem}
.w-full{max-width:none}

.sec{padding-block:var(--site-section-y);position:relative}
.sec-none{padding-block:0}
.sec-compact{padding-block:calc(var(--site-section-y)*.55)}
.sec-roomy{padding-block:calc(var(--site-section-y)*1.5)}
.bg-surface{background:var(--site-surface)}
.bg-contrast{background:var(--site-fg);color:var(--site-bg)}
.bg-contrast .muted{color:rgb(var(--site-accent-rgb)/.85)}
.bg-accent{background:var(--site-accent);color:var(--site-accent-fg)}
.bg-accent .muted{color:var(--site-accent-fg);opacity:.8}
.ta-center{text-align:center}
.ta-center .lede,.ta-center .head{margin-inline:auto}

.head{max-width:44rem}
.eyebrow{font-size:.75rem;letter-spacing:.14em;text-transform:uppercase;color:var(--site-muted);margin-bottom:.75rem;font-weight:500}
.lede{margin-top:1rem;font-size:1.0625rem;color:var(--site-muted);max-width:44rem}
.muted{color:var(--site-muted)}

.grid{display:grid;gap:var(--site-gap)}
.g2{grid-template-columns:repeat(2,minmax(0,1fr))}
.g3{grid-template-columns:repeat(3,minmax(0,1fr))}
.g4{grid-template-columns:repeat(4,minmax(0,1fr))}
@media (max-width:1023px){.g3,.g4{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:639px){.g2,.g3,.g4{grid-template-columns:minmax(0,1fr)}}
.stack{display:flex;flex-direction:column;gap:var(--site-gap)}
.row{display:flex;flex-wrap:wrap;gap:.75rem;align-items:center}

.card{background:var(--site-surface-elevated);border:1px solid var(--site-border);border-radius:var(--site-radius-lg);padding:1.5rem;height:100%}
.card h3{font-size:1.0625rem}
.card p{margin-top:.5rem;color:var(--site-muted);font-size:.9375rem}

.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;padding:.75rem 1.25rem;border-radius:var(--site-button-radius);border:1px solid transparent;font-size:.9375rem;font-weight:500;cursor:pointer;transition:opacity .18s,background-color .18s,border-color .18s;text-align:center}
.btn:hover{opacity:.88}
.btn-primary{background:var(--site-accent);color:var(--site-accent-fg)}
.btn-secondary{background:transparent;border-color:var(--site-border);color:inherit}
.btn-secondary:hover{border-color:var(--site-accent)}
.btn-ghost{background:rgb(var(--site-fg-rgb)/.06);color:inherit}
.btn-link{padding:0;background:none;color:var(--site-accent);text-decoration:underline;text-underline-offset:3px}
.btn[disabled],.btn[aria-disabled=true]{opacity:.55;cursor:not-allowed}

.hdr{position:sticky;top:0;z-index:40;background:rgb(var(--site-fg-rgb)/0);backdrop-filter:blur(12px);border-bottom:1px solid transparent;transition:background-color .2s,border-color .2s}
.hdr-solid{background:color-mix(in srgb,var(--site-bg) 88%,transparent);border-bottom-color:var(--site-border)}
@supports not (backdrop-filter:blur(1px)){.hdr-solid{background:var(--site-bg)}}
.hdr-in{display:flex;align-items:center;justify-content:space-between;gap:1.5rem;min-height:4.25rem}
.brand{display:flex;align-items:center;gap:.625rem;font-family:var(--site-font-heading);font-weight:600;font-size:1.0625rem;letter-spacing:-.01em}
.brand img{max-height:2.25rem;width:auto}
.nav{display:flex;align-items:center;gap:1.5rem}
.nav a{font-size:.9375rem;color:var(--site-muted);transition:color .15s}
.nav a:hover,.nav a[aria-current=page]{color:var(--site-fg)}
.nav-toggle{display:none;background:none;border:1px solid var(--site-border);border-radius:var(--site-radius-sm);padding:.5rem;cursor:pointer}
@media (max-width:899px){
  .nav-desktop{display:none}
  .nav-toggle{display:inline-flex}
  .nav-mobile{display:none;padding-block:1rem;border-top:1px solid var(--site-border)}
  .nav-mobile[data-open=true]{display:block}
  .nav-mobile a{display:block;padding:.75rem 0;font-size:1rem;border-bottom:1px solid var(--site-border)}
  .nav-mobile a:last-child{border-bottom:0}
}
@media (min-width:900px){.nav-mobile,.nav-toggle{display:none}}

.hero{position:relative;padding-block:calc(var(--site-section-y)*1.35)}
.hero-media{position:absolute;inset:0;z-index:-1;overflow:hidden}
.hero-media img{width:100%;height:100%;object-fit:cover}
.hero-media::after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,rgb(0 0 0/.35),rgb(0 0 0/.65))}
.hero-overlay{color:#fff}
.hero-overlay .muted,.hero-overlay .lede{color:rgb(255 255 255/.82)}
.hero-split{display:grid;gap:2.5rem;align-items:center}
@media (min-width:900px){.hero-split{grid-template-columns:1fr 1fr;gap:4rem}}
.hero-split img{border-radius:var(--site-radius-lg);width:100%;object-fit:cover;aspect-ratio:4/3}
.hero p.lede{font-size:1.125rem}
.hero .row{margin-top:2rem}
.highlights{display:flex;flex-wrap:wrap;gap:.5rem 1.25rem;margin-top:1.75rem;font-size:.875rem;color:var(--site-muted)}
.highlights li{display:flex;align-items:center;gap:.4rem;list-style:none}
.highlights li::before{content:"";width:.3rem;height:.3rem;border-radius:9999px;background:var(--site-accent)}

.media-split{display:grid;gap:2rem;align-items:center}
@media (min-width:900px){.media-split{grid-template-columns:1fr 1fr;gap:3.5rem}.media-split.rev>*:first-child{order:2}}
.media-split img{border-radius:var(--site-radius-lg);width:100%;aspect-ratio:4/3;object-fit:cover}

.prose>*+*{margin-top:1rem}
.prose h2{margin-top:2rem;font-size:calc(var(--site-h3)*1.15)}
.prose h3{margin-top:1.75rem}
.prose ul,.prose ol{padding-left:1.25rem;color:var(--site-muted)}
.prose li+li{margin-top:.375rem}
.prose blockquote{border-left:2px solid var(--site-accent);padding-left:1.25rem;font-size:1.0625rem;font-style:italic;color:var(--site-muted)}
.prose p{color:var(--site-muted)}

.gal{display:grid;gap:.75rem}
.gal img{width:100%;height:100%;object-fit:cover;border-radius:var(--site-radius-md);aspect-ratio:4/3}
.gal-mosaic>*:first-child{grid-column:span 2;grid-row:span 2}
.gal-mosaic>*:first-child img{aspect-ratio:1}
.gal-strip{display:flex;gap:.75rem;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:.5rem}
.gal-strip>*{flex:0 0 min(78%,22rem);scroll-snap-align:start}

.feat{display:flex;flex-direction:column;gap:.625rem}
.feat-ico{width:2.25rem;height:2.25rem;display:grid;place-items:center;border-radius:var(--site-radius-sm);background:rgb(var(--site-accent-rgb)/.12);color:var(--site-accent)}
.steps{counter-reset:step;display:grid;gap:1.5rem}
.step{position:relative;padding-left:3.25rem;counter-increment:step}
.step::before{content:counter(step,decimal-leading-zero);position:absolute;left:0;top:-.15rem;font-family:var(--site-font-heading);font-size:1.25rem;font-weight:600;color:var(--site-accent)}
.step h3{font-size:1rem}
.step p{margin-top:.375rem;color:var(--site-muted);font-size:.9375rem}

.price-list{display:flex;flex-direction:column}
.price-row{display:flex;justify-content:space-between;align-items:baseline;gap:1.5rem;padding-block:1rem;border-bottom:1px solid var(--site-border)}
.price-row:last-child{border-bottom:0}
.price-row .dots{flex:1;border-bottom:1px dotted var(--site-border);transform:translateY(-.25rem)}
.price-amt{font-variant-numeric:tabular-nums;font-weight:500;white-space:nowrap}
.price-meta{font-size:.8125rem;color:var(--site-muted);margin-top:.25rem}

.plan{display:flex;flex-direction:column;gap:1rem}
.plan-hl{border-color:var(--site-accent);box-shadow:0 0 0 1px var(--site-accent)}
.plan-price{font-family:var(--site-font-heading);font-size:2rem;font-weight:600;letter-spacing:-.02em}
.plan ul{list-style:none;padding:0;display:flex;flex-direction:column;gap:.5rem;font-size:.9375rem;color:var(--site-muted)}
.plan li{display:flex;gap:.5rem;align-items:flex-start}
.plan li::before{content:"";flex:0 0 auto;width:1rem;height:1rem;margin-top:.2rem;border-radius:9999px;background:rgb(var(--site-accent-rgb)/.15)}

.quote{display:flex;flex-direction:column;gap:1rem}
.quote blockquote{font-size:1.0625rem;line-height:1.65}
.quote figcaption{font-size:.875rem;color:var(--site-muted)}
.stars{display:flex;gap:.15rem;color:var(--site-accent)}

details.faq{border-bottom:1px solid var(--site-border)}
details.faq summary{cursor:pointer;padding-block:1.125rem;font-weight:500;list-style:none;display:flex;justify-content:space-between;gap:1rem;align-items:center}
details.faq summary::-webkit-details-marker{display:none}
details.faq summary::after{content:"+";font-size:1.25rem;color:var(--site-muted);flex:0 0 auto;line-height:1}
details.faq[open] summary::after{content:"\\2212"}
details.faq p{padding-bottom:1.25rem;color:var(--site-muted);max-width:52rem}

.form{display:grid;gap:1rem;max-width:34rem}
.form.wide{max-width:none}
.field{display:flex;flex-direction:column;gap:.375rem}
.field label{font-size:.875rem;font-weight:500}
.field .hint{font-size:.8125rem;color:var(--site-muted)}
.field input,.field textarea,.field select{
  width:100%;padding:.7rem .875rem;border:1px solid var(--site-border);
  border-radius:var(--site-radius-sm);background:var(--site-bg);
}
.field textarea{min-height:8rem;resize:vertical}
.field input:focus-visible,.field textarea:focus-visible,.field select:focus-visible{border-color:var(--site-accent)}
.field-error input,.field-error textarea{border-color:#c0392b}
.err{font-size:.8125rem;color:#c0392b}
.consent{display:flex;gap:.625rem;align-items:flex-start;font-size:.8125rem;color:var(--site-muted)}
.consent input{margin-top:.2rem;width:auto}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.form-note{font-size:.8125rem;color:var(--site-muted)}
.form-status{padding:.875rem 1rem;border-radius:var(--site-radius-sm);font-size:.9375rem}
.form-status[data-tone=ok]{background:rgb(var(--site-accent-rgb)/.1);border:1px solid rgb(var(--site-accent-rgb)/.3)}
.form-status[data-tone=err]{background:rgb(192 57 43/.08);border:1px solid rgb(192 57 43/.3);color:#c0392b}

.hours{display:grid;gap:.5rem;max-width:26rem}
.hours-row{display:flex;justify-content:space-between;gap:1rem;padding-block:.5rem;border-bottom:1px solid var(--site-border);font-size:.9375rem}
.hours-row:last-child{border-bottom:0}
.hours-row[data-today=true]{font-weight:600}
.badge{display:inline-flex;align-items:center;gap:.4rem;padding:.3rem .625rem;border-radius:9999px;font-size:.75rem;font-weight:500;background:rgb(var(--site-accent-rgb)/.12);color:var(--site-accent)}
.badge-dot{width:.4rem;height:.4rem;border-radius:9999px;background:currentColor}

.tags{display:flex;flex-wrap:wrap;gap:.5rem}
.tag{padding:.4rem .75rem;border:1px solid var(--site-border);border-radius:9999px;font-size:.875rem;color:var(--site-muted)}

.item-media{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--site-radius-md)}
.item{display:flex;flex-direction:column;gap:.75rem}
.item h3{font-size:1rem}
.item-price{font-weight:500;font-variant-numeric:tabular-nums}
.item-meta{font-size:.8125rem;color:var(--site-muted);display:flex;flex-wrap:wrap;gap:.75rem}

.embed{position:relative;width:100%;border-radius:var(--site-radius-lg);overflow:hidden;background:var(--site-surface)}
.embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.ar-16-9{aspect-ratio:16/9}.ar-4-3{aspect-ratio:4/3}.ar-1-1{aspect-ratio:1}

.stats{display:grid;gap:2rem;grid-template-columns:repeat(auto-fit,minmax(9rem,1fr))}
.stat-v{font-family:var(--site-font-heading);font-size:clamp(2rem,4vw,2.75rem);font-weight:600;letter-spacing:-.03em}
.stat-l{font-size:.875rem;color:var(--site-muted);margin-top:.25rem}

.logos{display:flex;flex-wrap:wrap;gap:2rem;align-items:center;justify-content:center}
.logos img{max-height:2.5rem;width:auto;opacity:.7}
.logos-gray img{filter:grayscale(1)}

.ba{display:grid;gap:.5rem;grid-template-columns:1fr 1fr}
.ba img{aspect-ratio:1;object-fit:cover;border-radius:var(--site-radius-md)}
.ba-lbl{font-size:.75rem;letter-spacing:.1em;text-transform:uppercase;color:var(--site-muted);margin-bottom:.35rem}

.ftr{border-top:1px solid var(--site-border);padding-block:3rem;background:var(--site-surface);font-size:.875rem}
.ftr-grid{display:grid;gap:2rem}
@media (min-width:768px){.ftr-grid{grid-template-columns:1.5fr 1fr 1fr}}
.ftr h2{font-size:.75rem;letter-spacing:.12em;text-transform:uppercase;color:var(--site-muted);margin-bottom:.75rem;font-weight:500}
.ftr a{color:var(--site-muted)}
.ftr a:hover{color:var(--site-fg)}
.ftr ul{list-style:none;padding:0;display:flex;flex-direction:column;gap:.5rem}
.ftr-btm{margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid var(--site-border);display:flex;flex-wrap:wrap;gap:1rem;justify-content:space-between;color:var(--site-muted);font-size:.8125rem}

.tabs{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1.75rem}
.tab{padding:.5rem 1rem;border-radius:9999px;border:1px solid var(--site-border);background:none;cursor:pointer;font-size:.875rem;color:var(--site-muted)}
.tab[aria-selected=true]{background:var(--site-accent);border-color:var(--site-accent);color:var(--site-accent-fg)}
.tabpanel[hidden]{display:none}

.cookie{position:fixed;left:1rem;right:1rem;bottom:1rem;z-index:60;max-width:30rem;padding:1.125rem 1.25rem;border:1px solid var(--site-border);border-radius:var(--site-radius-lg);background:var(--site-surface-elevated);box-shadow:0 12px 40px rgb(0 0 0/.16);font-size:.875rem}

.rv{opacity:0;transform:translateY(14px);transition:opacity .6s cubic-bezier(.16,1,.3,1),transform .6s cubic-bezier(.16,1,.3,1)}
.rv[data-in=true]{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.rv{opacity:1;transform:none;transition:none}}

.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
@media print{.hdr,.cookie,.btn{display:none}}
`;
