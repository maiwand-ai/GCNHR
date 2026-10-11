const fs=require('fs'), vm=require('vm'), assert=require('node:assert/strict');
process.chdir(require('path').resolve(__dirname,'..'));
class Node {
 constructor(){this.handlers={};this.attrs={};this.open=false;this.classList={remove(){},toggle(){}};this.summary={focus:()=>this.focused=true};}
 addEventListener(key,fn){this.handlers[key]=fn;}setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k];}focus(){this.focused=true;}
 contains(node){return node===this || node===this.summary;}querySelector(){return this.summary;}
}
const groups=[new Node(),new Node(),new Node()],nav=new Node(),menuToggle=new Node(),header=new Node();
const link=new Node();link.attrs.href='membership.html';
nav.querySelectorAll=s=>s==='.nav-group'?groups:s==='a[href]'?[link]:[];
nav.contains=node=>node===nav||groups.some(group=>group.contains(node));
const document=new Node();
const context={nav,menuToggle,header,document,location:{href:'https://example.org/membership.html',pathname:'/membership.html'},URL};
const source=fs.readFileSync('app.js','utf8').split('// Mobile menu.')[1].split('// Highlight the nav link')[0];
vm.runInNewContext(source,context);
assert.equal(link.attrs['aria-current'],'page');
groups[0].open=true;groups[1].open=true;groups[1].handlers.toggle();assert(!groups[0].open);assert(groups[1].open);
document.handlers.click({target:{}});assert(groups.every(g=>!g.open));
groups[0].open=true;document.handlers.focusin({target:groups[1].summary});assert(!groups[0].open);
groups[0].open=true;document.activeElement=groups[0].summary;document.handlers.keydown({key:'Escape'});assert(!groups[0].open);assert(groups[0].focused);
menuToggle.attrs['aria-expanded']='true';document.activeElement={};document.handlers.keydown({key:'Escape'});assert.equal(menuToggle.attrs['aria-expanded'],'false');assert(menuToggle.focused);
console.log('Passed navigation behavior: one open dropdown, outside click, focus exit, Escape focus restoration and current-page marking.');
