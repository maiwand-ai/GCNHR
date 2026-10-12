const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
process.chdir(require('path').resolve(__dirname,'..'));
class Node {
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.handlers={};this.classList={add(){}};this.files=[];}
 append(node){this.children.push(node);node.parentElement=this;}
 insertAdjacentElement(where,node){node.parentElement=this.parentElement;this.parentElement.children.push(node);}
 addEventListener(type,fn){this.handlers[type]=fn;}
 click(){
  const event={target:this,defaultPrevented:false,stopped:false,preventDefault(){this.defaultPrevented=true;},stopPropagation(){this.stopped=true;}};
  for(let node=this;node;node=node.parentElement){node.handlers.click?.(event);if(event.stopped)break;}
  if(this.type==='file'&&!event.defaultPrevented)this.pickerOpened=true;
 }
}
const host=new Node('div');const img=new Node('img');img.dataset.img='hero';host.append(img);
const duplicate=new Node('img');duplicate.dataset.img='hero';host.append(duplicate);
const emblem=new Node('img');emblem.dataset.img='emblem';host.append(emblem);
let replacement;
const context={document:{querySelectorAll:()=>[img,duplicate,emblem]},GH:{IMAGE_SLOTS:[{key:'hero',max:2000}]},SKIP_PICTURE_BUTTON:new Set(['emblem']),el:(tag,className)=>{const node=new Node(tag);node.className=className;return node;},replacePicture:(...args)=>replacement=args};
const source=fs.readFileSync('editor.js','utf8').split('  function addPictureButtons()')[1].split('  async function replacePicture')[0];
vm.runInNewContext('function addPictureButtons()'+source+'\naddPictureButtons();',context);
const buttons=host.children.filter(n=>n.tag==='button');assert.equal(buttons.length,1);
const button=buttons[0],input=host.children.find(n=>n.type==='file');
assert.equal(input.parentElement,host);assert(!button.children.includes(input));assert.equal(input.className,'gcnhr-ui');
button.click();assert(input.pickerOpened,'Button must not cancel file input activation');
input.files=[{name:'photo.jpg'}];input.value='photo.jpg';input.handlers.change();assert.equal(replacement[0].key,'hero');assert.equal(replacement[1].name,'photo.jpg');assert.equal(replacement[2],button);assert.equal(input.value,'');
replacement=null;input.handlers.change();assert.equal(replacement[1].name,'photo.jpg');
replacement=null;input.files=[];input.handlers.change();assert.equal(replacement,null);
console.log('Passed photo editor checks: uncancelled file picker activation, sibling input, upload selection, cancellation, repeated selection and duplicate-slot handling.');
