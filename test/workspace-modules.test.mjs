import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const source=await readFile(new URL('../src/workspace-modules.js',import.meta.url),'utf8');
function fixture(company='PUSULA'){
 const requests=[],opened=[],stored=new Map(),created=[];
 class Node{
  constructor(){this.handlers={};this.hidden=false;this.dataset={};this.style={};this.attributes={};this.members=new Set();this.classList={add:(...names)=>names.forEach(x=>this.members.add(x)),remove:(...names)=>names.forEach(x=>this.members.delete(x)),toggle:(name,on)=>on?this.members.add(name):this.members.delete(name)};}
  addEventListener(type,fn){this.handlers[type]=fn;}
  setAttribute(key,value){this.attributes[key]=value;}
  append(node){created.push(node);}
  after(node){this.afterNode=node;}
  querySelectorAll(){return [];}
  remove(){this.removed=true;}
  fire(type,event={}){return this.handlers[type]?.(event);}
 }
 const follow=new Node(),expenses=new Node(),aside=new Node(),main=new Node(),body=new Node(),page=new Node();
 follow.getAttribute=()=>'/workspace/'+company+'/takip/';expenses.getAttribute=()=>'/workspace/'+company+'/masraf/';main.querySelectorAll=selector=>selector==='.page'?[page]:[];
 const document={readyState:'complete',body,getElementById:id=>id==='swEarlyFollow'?follow:id==='swEarlyExpenses'?expenses:null,querySelector:s=>s==='body > main'?main:s==='body > aside'?aside:null,querySelectorAll:s=>s==='aside a.nav-item'?[follow,expenses]:[],createElement(tag){const node=new Node();if(tag==='iframe'){node.contentWindow={SW_CONTEXT:{company:{id:company}},SWOpenEmbedded:(view,month)=>opened.push({view,month}),SWSetEmbeddedActive(){}};Object.defineProperty(node,'srcdoc',{set(value){this.source=value;queueMicrotask(()=>this.onload());}});}return node;}};
 const sessionStorage={getItem:k=>stored.get(k)||null,setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)};
 const window={SW_CONTEXT:{company:{id:company}},scrollTo(){},requestIdleCallback(){}};
 const context={window,document,sessionStorage,URLSearchParams,location:{search:''},history:{replaceState(){}},matchMedia:()=>({matches:false}),requestIdleCallback:window.requestIdleCallback,setTimeout,console,fetch:async url=>{requests.push(url);return {ok:true,redirected:false,text:async()=>'<html><head></head><body></body></html>'};}};
 vm.runInNewContext(source,context);
 const click=()=>({button:0,preventDefault(){this.prevented=true;}});
 return {follow,expenses,aside,main,body,page,requests,opened,created,click,settle:()=>new Promise(resolve=>setTimeout(resolve,10))};
}

test('Embedded modules reuse their documents while native navigation stays in the workspace',async()=>{
 const f=fixture(),first=f.click();f.follow.fire('click',first);assert.equal(first.prevented,true);await f.settle();
 assert.deepEqual(f.requests,['/workspace/PUSULA/takip/']);assert.equal(f.opened.at(-1).view,'overview');
 const submenu=f.follow.afterNode,invoice={dataset:{followView:'invoices'}};submenu.fire('click',{target:{closest:()=>invoice}});await f.settle();
 assert.equal(f.opened.at(-1).view,'invoices');assert.equal(f.requests.length,1);
 f.expenses.fire('click',f.click());await f.settle();assert.deepEqual(f.requests,['/workspace/PUSULA/takip/','/workspace/PUSULA/masraf/']);
 f.follow.fire('click',f.click());await f.settle();assert.equal(f.requests.length,2);assert.equal(f.created.filter(n=>n.title).length,2);
 f.aside.fire('click',{target:{closest:()=>({})}});assert.equal(f.body.members.has('sw-embedded-active'),false);
});

test('Embedded requests remain scoped to the active company',async()=>{
 const f=fixture('COMED');f.follow.fire('click',f.click());await f.settle();f.expenses.fire('click',f.click());await f.settle();
 assert.deepEqual(f.requests,['/workspace/COMED/takip/','/workspace/COMED/masraf/']);
});
