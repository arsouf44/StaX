/**
 * Script et styles de l apercu en mode editeur.
 *
 * Ils ne sont inclus QUE dans l apercu prive du brouillon, jamais dans une
 * page publique. L apercu tourne dans une origine opaque (iframe en bac a
 * sable) : il ne peut rien lire de la plateforme, seulement lui ENVOYER des
 * messages — et uniquement a l origine de la plateforme, fixee cote serveur.
 *
 * Ce que le client peut faire dans l apercu :
 *  - survoler : la section sous la souris est entouree et nommee ;
 *  - cliquer : la section est selectionnee dans l editeur, et l element clique
 *    (titre, texte, image, bouton) designe le champ a modifier ;
 *  - rien d autre : les liens ne naviguent pas, les formulaires ne partent pas.
 */

export const EDITOR_STYLES = `
[data-stax-block]{position:relative;cursor:pointer;transition:outline-color .15s}
[data-stax-block]:hover{outline:2px dashed rgba(124,92,255,.7);outline-offset:-2px}
[data-stax-block].stax-selected{outline:3px solid #7c5cff;outline-offset:-3px}
[data-stax-block]:hover::before,[data-stax-block].stax-selected::before{content:attr(data-stax-label);position:absolute;z-index:40;top:6px;left:6px;background:#7c5cff;color:#fff;font:600 12px/1.2 system-ui,sans-serif;padding:4px 8px;border-radius:6px;pointer-events:none}
[data-stax-hidden="true"]{opacity:.45;background-image:repeating-linear-gradient(135deg,transparent 0 14px,rgba(0,0,0,.035) 14px 28px)}
[data-stax-hidden="true"]::after{content:"Masquée — invisible pour vos visiteurs";position:absolute;z-index:40;top:6px;right:6px;background:#1f1f24;color:#fff;font:600 12px/1.2 system-ui,sans-serif;padding:4px 8px;border-radius:6px}
.stax-empty{border:2px dashed rgba(124,92,255,.35);background:rgba(124,92,255,.04)}
.stax-field-hover{outline:2px solid rgba(124,92,255,.35);outline-offset:2px;border-radius:4px}
[data-stax-block]{scroll-margin-top:96px}
.rv,.rv[data-in]{opacity:1!important;transform:none!important;transition:none!important}
`;

/*
 * Les deux dernieres regles : une section amenee a l ecran ne se cache plus
 * sous l en-tete fixe du site, et les apparitions au defilement sont coupees.
 * L apercu est recharge a chaque enregistrement : sans cela, toutes les
 * sections rejoueraient leur animation a chaque lettre tapee.
 */

/**
 * Le script recoit l origine parente et l etat initial en JSON : aucune valeur
 * n est interpolee sans passer par JSON.stringify, donc aucune injection.
 */
export function editorScript(options: {
  parentOrigin: string;
  selectedBlockId: string | null;
  scrollY: number;
}): string {
  const config = JSON.stringify(options).replace(/</g, '\\u003c');
  return `(function(){
var cfg=${config};
var selected=null;
function post(message){try{parent.postMessage(Object.assign({source:'stax-preview'},message),cfg.parentOrigin);}catch(e){}}
function blockOf(el){return el&&el.closest?el.closest('[data-stax-block]'):null;}
function fieldOf(target,block){
  var el=target.closest('h1,h2,h3,.eyebrow,.lede,img,a.btn,blockquote,li,p');
  if(!el||!block.contains(el))return null;
  if(el.matches('img'))return 'media';
  if(el.matches('a.btn'))return 'actions';
  if(el.matches('.eyebrow'))return 'eyebrow';
  if(el.matches('.lede'))return 'subtitle';
  if(el.matches('h1,h2'))return 'title';
  return null;
}
function select(block,scroll){
  if(selected)selected.classList.remove('stax-selected');
  selected=block;
  if(!block)return;
  block.classList.add('stax-selected');
  if(!scroll)return;
  var top=block.getBoundingClientRect().top;
  if(top<96||top>window.innerHeight*0.6)block.scrollIntoView({block:'start',behavior:'smooth'});
}
document.addEventListener('click',function(event){
  var block=blockOf(event.target);
  event.preventDefault();event.stopPropagation();
  if(!block)return;
  select(block,false);
  var index=null;var btn=event.target.closest('a.btn');
  if(btn){var all=block.querySelectorAll('a.btn');for(var i=0;i<all.length;i++){if(all[i]===btn){index=i;}}}
  post({type:'select',blockId:block.getAttribute('data-stax-block'),field:fieldOf(event.target,block),index:index});
},true);
document.addEventListener('submit',function(event){event.preventDefault();},true);
window.addEventListener('message',function(event){
  if(event.source!==parent)return;
  var data=event.data||{};
  if(data.type==='stax:select'){
    var target=null;var blocks=document.querySelectorAll('[data-stax-block]');
    for(var i=0;i<blocks.length;i++){if(blocks[i].getAttribute('data-stax-block')===data.blockId){target=blocks[i];}}
    select(target,Boolean(data.scroll));
  }
});
var timer=null;
window.addEventListener('scroll',function(){
  if(timer)return;
  timer=setTimeout(function(){timer=null;post({type:'scroll',y:Math.round(window.scrollY)});},150);
},{passive:true});
function restore(){
  if(cfg.scrollY>0)window.scrollTo(0,cfg.scrollY);
  if(cfg.selectedBlockId){
    var blocks=document.querySelectorAll('[data-stax-block]');
    for(var i=0;i<blocks.length;i++){if(blocks[i].getAttribute('data-stax-block')===cfg.selectedBlockId){select(blocks[i],false);}}
  }
  post({type:'ready',height:document.documentElement.scrollHeight});
}
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',restore);}else{restore();}
})();`;
}
