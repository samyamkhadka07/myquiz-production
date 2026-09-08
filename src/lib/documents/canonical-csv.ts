import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { questionSchema,type QuestionInput,type Taxonomy } from '@/lib/contracts';
export const CSV_COLUMNS=['schema_version','text_encoding','question_text','option_a','option_b','option_c','option_d','correct_answer','explanation','option_explanations','subject_code','unit_code','topic_name','program_code','difficulty','cognitive_level','source_type','source_year','source_document','source_url','source_page','source_question_number','provenance'] as const;
export type CsvRow={row:number;data:Partial<QuestionInput>;errors:string[]};
const protect=(value:unknown)=>{const s=value==null?'':String(value);return /^[\s]*[=+\-@]|^'/.test(s)?`'${s}`:s;};
const restore=(s:string,encoding:string)=>encoding==='spreadsheet-safe-v1'&&s.startsWith("'")?s.slice(1):s;
export function exportCsv(questions:QuestionInput[],t:Taxonomy){return stringify(questions.map(q=>{
 const base={...q,schema_version:'1',text_encoding:'spreadsheet-safe-v1',option_explanations:JSON.stringify(q.option_explanations),provenance:JSON.stringify(q.provenance),subject_code:t.subjects.find(s=>s.id===q.subject_id)?.code??'',unit_code:t.units.find(u=>u.id===q.unit_id)?.code??'',topic_name:t.topics.find(p=>p.id===q.topic_id)?.name??'',program_code:t.programs.find(p=>p.id===q.exam_program_id)?.code??''};
 return Object.fromEntries(CSV_COLUMNS.map(k=>[k,protect(base[k as keyof typeof base])]));
}),{header:true,columns:CSV_COLUMNS,quoted:true,record_delimiter:'\r\n'});}
export function parseCanonicalCsv(text:string,t:Taxonomy):CsvRow[]{
 let headers:string[]=[];
 const records=parse(text,{bom:true,columns:(cols:string[])=>{headers=cols;if(new Set(cols).size!==cols.length)throw new Error('Duplicate CSV header');const unexpected=cols.filter(c=>!CSV_COLUMNS.includes(c as typeof CSV_COLUMNS[number]));if(unexpected.length)throw new Error(`Unknown columns: ${unexpected.join(', ')}`);if(!cols.includes('question_text'))throw new Error('Missing question_text header');return cols;},skip_empty_lines:true,relax_column_count:false,max_record_size:131072}) as Record<string,string>[];
 if(!headers.length)throw new Error('CSV header is missing');
 return records.map((raw,index)=>{
  const row=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,restore(v,raw.text_encoding??'')]));const errors:string[]=[];
  if(row.schema_version!=='1')errors.push('schema_version must be 1');
  const subject=t.subjects.find(s=>s.code===row.subject_code),unit=t.units.find(u=>u.code===row.unit_code&&u.subject_id===subject?.id),topic=t.topics.find(p=>p.name===row.topic_name&&p.unit_id===unit?.id),program=t.programs.find(p=>p.code===row.program_code);
  if(!subject)errors.push('Unknown subject_code');if(!unit)errors.push('Unknown unit_code for subject');if(row.topic_name&&!topic)errors.push('Unknown topic_name for unit');if(row.program_code&&!program)errors.push('Unknown program_code');
  const json=(key:string,fallback:unknown)=>{try{return row[key]?JSON.parse(row[key]):fallback;}catch{errors.push(`Invalid JSON in ${key}`);return fallback;}};
  const input={question_text:row.question_text??'',option_a:row.option_a??'',option_b:row.option_b??'',option_c:row.option_c??'',option_d:row.option_d??'',correct_answer:row.correct_answer||null,explanation:row.explanation||null,option_explanations:json('option_explanations',{A:'',B:'',C:'',D:''}),subject_id:subject?.id,unit_id:unit?.id,topic_id:topic?.id??null,exam_program_id:program?.id??null,difficulty:row.difficulty||null,cognitive_level:row.cognitive_level||null,source_type:row.source_type||'CSV',source_year:row.source_year?Number(row.source_year):null,source_document:row.source_document||null,source_url:row.source_url||null,source_page:row.source_page?Number(row.source_page):null,source_question_number:row.source_question_number||null,provenance:json('provenance',{})};
  const result=questionSchema.safeParse(input);if(!result.success)errors.push(...result.error.issues.map(x=>`${x.path.join('.')}: ${x.message}`));
  if(!input.correct_answer)errors.push('Answer key missing: human verification required');
  return {row:index+2,data:(result.success?result.data:input) as Partial<QuestionInput>,errors};
 });
}
