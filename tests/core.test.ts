import { describe,it,expect } from 'vitest';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fc from 'fast-check';
import { scoreResponses } from '@/lib/quiz/scoring';
import { priorityScore } from '@/lib/recommendations/deterministic';
import academic from '../data/mec-2026.json';
describe('production scoring',()=>{
 it('scores mixed answers with blueprint policy',()=>expect(scoreResponses([{selected:'A',correct:'A'},{selected:'B',correct:'A'},{selected:null,correct:'A'}],{correct:1,incorrect:-.25,unanswered:0})).toEqual({correct:1,incorrect:1,unanswered:1,score:.75,maximum:3}));
 it('applies negative marks to 200 wrong answers',()=>expect(scoreResponses(Array.from({length:200},()=>({selected:'B',correct:'A'})))).toMatchObject({score:-50}));
 it('uses supplied policy',()=>expect(scoreResponses([{selected:'A',correct:'A'}],{correct:2,incorrect:-1,unanswered:0}).score).toBe(2));
 it('preserves count and scoring bounds for arbitrary answer sets',()=>fc.assert(fc.property(fc.array(fc.record({selected:fc.constantFrom('A' as const,'B' as const,'C' as const,'D' as const,null),correct:fc.constantFrom('A' as const,'B' as const,'C' as const,'D' as const)}),{maxLength:200}),responses=>{const r=scoreResponses(responses);expect(r.correct+r.incorrect+r.unanswered).toBe(responses.length);expect(r.score).toBeGreaterThanOrEqual(-.25*responses.length);expect(r.score).toBeLessThanOrEqual(responses.length);} ),{numRuns:300}));
});
describe('academic source',()=>{
 it('preserves original PDF checksum',()=>expect(createHash('sha256').update(fs.readFileSync(academic.source_document)).digest('hex')).toBe(academic.sha256));
 for(const group of academic.groups)it(`Group ${group.code} totals 200 with consistent taxonomy`,()=>{expect(group.allocations.reduce((n,a)=>n+a.question_count,0)).toBe(group.question_count);expect(Object.values(group.cognitive_distribution).reduce((a,b)=>a+b,0)).toBe(100);for(const a of group.allocations)expect(academic.units.some(u=>u.code===a.unit_code&&u.subject===a.subject)).toBe(true);expect(group.duration_seconds).toBe(10800);expect(group.qualification_rule).toEqual({type:'PERCENTILE',threshold:50});});
 it('keeps undefined PCL detail unseeded',()=>expect(academic.units.filter(u=>u.subject==='PCL').flatMap(u=>u.topics)).toEqual([]));
 it('retains exact source substrings for every detailed topic',()=>{for(const u of academic.units)for(const t of u.topics)expect(u.source_text).toContain(t.source_text);});
});
describe('deterministic recommendations',()=>{
 it('prioritizes weak, slow, overdue material',()=>{const base={topicId:"fixture",attempts:20,avgResponseMs:0,daysSincePractice:0,overdueCards:0};expect(priorityScore({...base,accuracy:.2,avgResponseMs:90000,daysSincePractice:20,overdueCards:10})).toBeGreaterThan(priorityScore({...base,accuracy:.95}));});
 it('clamps inaccurate inputs and remains finite',()=>fc.assert(fc.property(fc.integer({min:0,max:300}),n=>{const score=priorityScore({topicId:"fixture",accuracy:n/100,attempts:n,avgResponseMs:n*1000,daysSincePractice:n,overdueCards:n});expect(score).toBeGreaterThanOrEqual(0);expect(score).toBeLessThanOrEqual(1);} )));
});
describe('admin access request UI contract',()=>{
 it('offers Student and approval-gated Admin registration choices',()=>{const source=fs.readFileSync('src/components/auth-form.tsx','utf8');expect(source).toContain('Admin (approval required)');expect(source).toContain('Super Admin approves your request');});
 it('does not hard-code a personal Gmail identity into application source',()=>{for(const file of ['src/app/auth/actions.ts','src/lib/server/auth.ts','supabase/migrations/0016_super_admin_approval.sql'])expect(fs.readFileSync(file,'utf8')).not.toMatch(/@gmail\.com/i);});
});
