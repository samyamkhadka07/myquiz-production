import test from "node:test";
import assert from "node:assert/strict";
function score(items){return items.reduce((n,x)=>n+(x.s===null?0:x.s===x.c?1:-.25),0)}
function priority(s){const e=1-Math.max(0,Math.min(1,s.accuracy));const c=Math.min(1,s.attempts/20);const slow=Math.min(1,s.avgResponseMs/120000);const rec=Math.min(1,s.daysSincePractice/30);const due=Math.min(1,s.overdueCards/20);return Number(((e*(.45+.15*c))+slow*.12+rec*.13+due*.15).toFixed(4))}
test("all correct",()=>assert.equal(score([{s:"A",c:"A"},{s:"D",c:"D"}]),2));
test("wrong answer penalty",()=>assert.equal(score([{s:"B",c:"A"}]),-.25));
test("unanswered is neutral",()=>assert.equal(score([{s:null,c:"A"}]),0));
test("mixed MEC scoring",()=>assert.equal(score([{s:"A",c:"A"},{s:"B",c:"A"},{s:null,c:"C"}]),.75));
test("200 wrong answers score -50",()=>assert.equal(score(Array.from({length:200},()=>({s:"B",c:"A"}))),-50));
test("priority is bounded for strong signals",()=>assert.ok(priority({accuracy:0,attempts:20,avgResponseMs:120000,daysSincePractice:30,overdueCards:20})<=1));
test("weak topic outranks mastered topic",()=>assert.ok(priority({accuracy:.2,attempts:10,avgResponseMs:90000,daysSincePractice:20,overdueCards:10})>priority({accuracy:.95,attempts:20,avgResponseMs:20000,daysSincePractice:1,overdueCards:0})));
test("accuracy clamps below zero",()=>assert.equal(priority({accuracy:-1,attempts:0,avgResponseMs:0,daysSincePractice:0,overdueCards:0}),.45));
test("accuracy clamps above one",()=>assert.equal(priority({accuracy:2,attempts:0,avgResponseMs:0,daysSincePractice:0,overdueCards:0}),0));
test("priority is deterministic",()=>{const x={accuracy:.5,attempts:8,avgResponseMs:60000,daysSincePractice:4,overdueCards:2};assert.equal(priority(x),priority(x))});
