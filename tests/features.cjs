// Behavioral checks using a small DOM fixture; no provider calls or real submissions.
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
process.chdir(require('path').resolve(__dirname, '..'));
const content = JSON.parse(fs.readFileSync('content/content.js', 'utf8').split('window.SITE_CONTENT =')[1].trim().replace(/;$/, ''));
class Node {
  constructor(tag='div') { this.tag=tag; this.children=[]; this.dataset={}; this.handlers={}; this.textContent=''; this.value=''; this.hidden=false; this.disabled=false; this.classList={add(){},remove(){}}; }
  append(...nodes){ this.children.push(...nodes); }
  prepend(...nodes){ this.children.unshift(...nodes); }
  replaceChildren(...nodes){ this.children=nodes; }
  get childElementCount(){ return this.children.length; }
  addEventListener(name,handler){ this.handlers[name]=handler; }
  hasAttribute(name){ return name==='data-empty'; }
  querySelector(){ return null; }
  getAttribute(name){ return this[name]; }
}
function fixture({settings={},kind='membership',valid=true,ok=true,networkError=false,collections={},language='en',preview=false}={}) {
  const nodes=Object.fromEntries(['data-submit','data-status','data-delivery'].map(k=>[k,new Node()]));
  const form=new Node('form'); form.dataset.kind=kind;
  const category=new Node('select'); category.value='individual';
  const organisation=new Node('input');
  form.querySelector=s=>s==='[name="category"]'?category:s==='[name="organisation"]'?organisation:nodes[s.slice(1,-1)]||null;
  form.reportValidity=()=>valid; form.reset=()=>form.didReset=true;
  const search=new Node('input');
  const eventInput=new Node('input'); eventInput.closest=()=>({scrollIntoView(){eventInput.scrolled=true;}}); eventInput.focus=()=>eventInput.focused=true;
  const fee=new Node(),portal=new Node('a'),donate=new Node('a'),donationNote=new Node();
  const link=new Node('a');link.href='news.html';
  const wraps=Object.keys(collections).map(key=>{const n=new Node();n.dataset.collection=key;n.nextElementSibling=new Node();return n;});
  const location={href:'https://example.org/GCNHR/membership.html'+(preview?'?preview=1':''),origin:'https://example.org'};
  const site={language,content:{...content,collections,settings:{...content.settings,...settings}},t:k=>content.text[language]?.[k]||content.text.en[k]||''};
  const document={createElement:tag=>new Node(tag),querySelectorAll:s=>s==='.feature-form'?[form]:s==='[data-collection]'?wraps:s==='a[href]'?[link]:[],querySelector:s=>({'#feature-search':search,'[data-fee]':fee,'[data-portal]':portal,'[data-donate]':donate,'[data-donation-note]':donationNote,'[name="event"]':eventInput}[s]||null)};
  class FormDataFixture {constructor(){this.data=new Map([['name','Test Applicant'],['email','test@example.org'],['consent','on']]);}set(k,v){this.data.set(k,v);}entries(){return this.data.entries();}}
  const requests=[];
  const context={window:{GCNHRSite:site,addEventListener(name,fn){this[name]=fn;}},document,location,URL,FormData:FormDataFixture,setTimeout:fn=>fn(),fetch:async (url,options)=>{requests.push({url,options});if(networkError)throw Error('Network error');return {ok};}};
  vm.runInNewContext(fs.readFileSync('features.js','utf8'),context);
  return {nodes,form,category,organisation,search,eventInput,fee,portal,donate,donationNote,link,wraps,location,requests,context,submit:()=>form.handlers.submit({preventDefault(){}})};
}
(async()=>{
 let checks=0;
 for(const kind of ['membership','event','volunteer','partnership','newsletter','donation']) {
  let f=fixture({kind});await f.submit();assert(f.location.href.startsWith('mailto:info@gcnhr.org?'));assert(!f.requests.length);assert(!f.form.didReset);assert(f.nodes['data-status'].textContent.includes('No application has been submitted'));checks++;
  f=fixture({kind,settings:{applicationEndpoint:'https://forms.example.org/apply',newsletterEndpoint:'https://forms.example.org/newsletter'}});await f.submit();
  assert.equal(f.requests[0].url,kind==='newsletter'?'https://forms.example.org/newsletter':'https://forms.example.org/apply');
  assert.equal(f.requests[0].options.method,'POST');assert.equal(f.requests[0].options.body.data.get('requestType'),kind);
  if(kind==='membership')assert.equal(f.requests[0].options.body.data.get('applicationStatus'),'pending_review');
  assert(f.form.didReset);assert(!f.nodes['data-submit'].disabled);checks++;
 }
 for(const mode of ['http','network']) {
  const f=fixture({settings:{applicationEndpoint:'https://forms.example.org/apply'},ok:false,networkError:mode==='network'});await f.submit();assert(!f.form.didReset);assert.equal(f.nodes['data-status'].textContent,content.text.en.featureError);assert(!f.nodes['data-submit'].disabled);checks++;
 }
 let f=fixture({valid:false,settings:{applicationEndpoint:'https://forms.example.org/apply'}});await f.submit();assert(!f.requests.length);assert(!f.location.href.startsWith('mailto:'));checks++;
 f=fixture();assert(!f.organisation.required);f.category.value='institutional';f.category.handlers.change();assert(f.organisation.required);checks++;
 for(const url of ['javascript:alert(1)','http://external.example.org/apply']) {f=fixture({settings:{applicationEndpoint:url}});await f.submit();assert(!f.requests.length);checks++;}
 f=fixture({settings:{membershipFee:'CHF 50 annually',memberPortalUrl:'https://members.example.org/',donationUrl:'https://pay.example.org/'},language:'fr',preview:true});
 assert.equal(f.fee.textContent,'CHF 50 annually');assert.equal(f.portal.href,'https://members.example.org/');assert.equal(f.donate.href,'https://pay.example.org/');assert(f.donationNote.hidden);assert(f.link.href.includes('lang=fr'));assert(f.link.href.includes('preview=1'));checks++;
 const events=[{title:{en:'Dialogue workshop',fr:'Atelier de dialogue'},description:{en:'Human rights training'},url:'javascript:alert(1)',registrationOpen:true},{title:{en:'Research conference'},description:{en:'Research meeting'},url:'https://example.org/report',registrationOpen:false}];
 f=fixture({collections:{events},language:'fr'});assert.equal(f.wraps[0].childElementCount,2);assert.equal(f.wraps[0].children[0].children[0].textContent,'Atelier de dialogue');
 assert(!f.wraps[0].children[0].children.some(n=>n.tag==='a'));assert(f.wraps[0].children[1].children.some(n=>n.tag==='a'));
 const button=f.wraps[0].children[0].children.find(n=>n.tag==='button');button.handlers.click();assert.equal(f.eventInput.value,'Atelier de dialogue');assert(f.eventInput.focused);checks++;
 f.search.value='missing';f.search.handlers.input();assert.equal(f.wraps[0].childElementCount,0);assert(!f.wraps[0].nextElementSibling.hidden);
 f.search.value='';f.search.handlers.input();assert.equal(f.wraps[0].childElementCount,2);assert(f.wraps[0].nextElementSibling.hidden);checks++;
 for(const kind of ['events','publications','news','team','documents']) {f=fixture({collections:{[kind]:[]}});assert(f.wraps[0].nextElementSibling.textContent.length);checks++;}
 console.log(`Passed ${checks} feature checks: all form types, validation, pending-review payload, failures, placeholders, search, event selection, translations and preview links.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
