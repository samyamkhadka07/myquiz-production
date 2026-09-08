import type { QuestionInput } from '@/lib/contracts';
export type ExtractedQuestion={number:string;data:Partial<QuestionInput>;errors:string[]};
export function detectQuestions(text:string,final=false):{questions:ExtractedQuestion[];carry:string}{
 const starts=[...text.matchAll(/^\s*(?:Q(?:uestion)?[.\s]*)?(\d{1,5})[.)]\s+(.+)/gim)];const questions:ExtractedQuestion[]=[];
 for(let i=0;i<starts.length-(final?0:1);i++){
  const start=starts[i]!;const end=starts[i+1]?.index??text.length;const block=text.slice(start.index,end);const lines=block.split(/\r?\n/);const stem:string[]=[];const options:Record<string,string>={};let active='stem';let correct:string|null=null;const explanation:string[]=[];
  for(const [j,line] of lines.entries()){
   const option=line.match(/^\s*\(?([A-Da-d])[.)]\s*(.*)$/);const key=line.match(/^\s*(?:answer|ans|key|correct answer)\s*[:=-]\s*\(?([A-Da-d])\)?\s*[.]?\s*$/i);
   if(key){correct=key[1]!.toUpperCase();active='after-key';continue;}
   if(/^\s*(?:solution|explanation)\s*[:=-]/i.test(line)){active='solution';explanation.push(line.replace(/^\s*(?:solution|explanation)\s*[:=-]\s*/i,''));continue;}
   if(option){active=option[1]!.toUpperCase();options[active]=option[2]??'';continue;}
   if(active==='stem')stem.push(j===0?line.replace(/^\s*(?:Q(?:uestion)?[.\s]*)?\d{1,5}[.)]\s*/i,''):line);
   else if(active==='solution')explanation.push(line);else if(active in options)options[active]+=`\n${line}`;
  }
  const errors=['Academic taxonomy requires review','Difficulty and cognitive level require review'];for(const k of ['A','B','C','D'])if(!options[k]?.trim())errors.push(`Missing option ${k}`);if(!correct)errors.push('Answer key not established');
  questions.push({number:start[1]!,data:{question_text:stem.join('\n').trim(),option_a:options.A?.trim()??'',option_b:options.B?.trim()??'',option_c:options.C?.trim()??'',option_d:options.D?.trim()??'',correct_answer:correct as QuestionInput['correct_answer'],explanation:explanation.join('\n').trim()||null,option_explanations:{A:'',B:'',C:'',D:''},source_question_number:start[1]!,source_type:'CONTRIBUTION',difficulty:null,cognitive_level:null,topic_id:null,provenance:{}},errors});
 }
 return {questions,carry:!final&&starts.length?text.slice(starts.at(-1)!.index):''};
}
export function detectAnswerKeys(text:string){return [...text.matchAll(/^\s*(?:Q\s*)?(\d{1,5})\s*[.):=-]\s*([A-D])\s*$/gim)].map(m=>({number:m[1]!,answer:m[2]!.toUpperCase()}));}
export function chunkText(text:string,size=12000){const result:string[]=[];for(let offset=0;offset<text.length;offset+=size)result.push(text.slice(offset,offset+size));return result;}
export function inspectSignature(bytes:Uint8Array,mime:string){
 const prefix=new TextDecoder().decode(bytes.slice(0,8));
 if(mime==='application/pdf')return prefix.startsWith('%PDF-');
 if(mime.includes('wordprocessingml'))return bytes[0]===0x50&&bytes[1]===0x4b;
 if(mime==='image/png')return bytes[0]===0x89&&prefix.slice(1,4)==='PNG';
 if(mime==='image/jpeg')return bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
 return (mime==='text/plain'||mime==='text/csv')&&!bytes.includes(0);
}
