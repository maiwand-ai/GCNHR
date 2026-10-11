const fs=require('fs');
const vm=require('vm');
const assert=require('node:assert/strict');
process.chdir(require('path').resolve(__dirname,'..'));
class Node {
 constructor(){this.children=[];this.value='';this.dataset={};this.handlers={};}
 append(...nodes){this.children.push(...nodes);} prepend(...nodes){this.children.unshift(...nodes);} replaceChildren(){this.children=[];}
 addEventListener(name,fn){this.handlers[name]=fn;}
}
const nodes=new Map();const get=sel=>{if(!nodes.has(sel))nodes.set(sel,new Node());return nodes.get(sel);};
get('#collection-kind').value='events';get('#collection-language').value='en';
const settings=[new Node(),new Node()];settings[0].dataset.setting='applicationEndpoint';settings[1].dataset.setting='donationUrl';
const document={querySelector:get,querySelectorAll:s=>s==='[data-setting]'?settings:[],createElement:()=>new Node()};
const context={document,window:{GCNHRGitHub:{detectRepo:()=>({owner:'test',name:'repo'}),IMAGE_SLOTS:[],readToken:()=>null},addEventListener(){}},structuredClone,setTimeout,clearTimeout};
vm.runInNewContext(fs.readFileSync('admin/admin.js','utf8')+'\nthis.audit={state,renderFeatureItems,renderSettings,countChanges,isDirty};',context);
const api=context.audit;
const content=JSON.parse(fs.readFileSync('content/content.js','utf8').split('window.SITE_CONTENT =')[1].trim().replace(/;$/, ''));
api.state.original=structuredClone(content);api.state.draft=structuredClone(content);
assert(!api.isDirty());
get('#add-item').handlers.click();assert.equal(api.state.draft.collections.events.length,1);assert(api.isDirty());assert.equal(api.countChanges(),1);
let card=get('#collection-items').children[0];
const title=card.children.find(n=>n.id==='item-0-title');title.value='Confirmed workshop';title.oninput();assert.equal(api.state.draft.collections.events[0].title.en,'Confirmed workshop');
get('#collection-language').value='fr';get('#collection-language').handlers.change();card=get('#collection-items').children[0];
const french=card.children.find(n=>n.id==='item-0-title');french.value='Atelier confirmé';french.oninput();assert.equal(api.state.draft.collections.events[0].title.fr,'Atelier confirmé');assert.equal(api.state.draft.collections.events[0].title.en,'Confirmed workshop');
const checkbox=card.children.flatMap(n=>n.children).find(n=>n.type==='checkbox');checkbox.checked=true;checkbox.onchange();assert(api.state.draft.collections.events[0].registrationOpen);
card.children.at(-1).onclick();assert.equal(api.state.draft.collections.events.length,0);assert(!api.isDirty());
for(const kind of ['publications','news','team','documents']) {get('#collection-kind').value=kind;get('#add-item').handlers.click();assert.equal(api.state.draft.collections[kind].length,1);}
api.renderSettings();settings[0].value='https://forms.example.org/apply';settings[0].oninput();settings[1].value='https://pay.example.org/';settings[1].oninput();assert.equal(api.state.draft.settings.applicationEndpoint,'https://forms.example.org/apply');assert.equal(api.state.draft.settings.donationUrl,'https://pay.example.org/');
console.log('Passed admin checks: add/edit/remove, English and French content, event registration toggle, dirty tracking, all content collections and service settings.');
