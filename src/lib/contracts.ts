import { z } from 'zod';
export const answerSchema=z.enum(['A','B','C','D']);
export const uuidSchema=z.uuid();
const nullableId=uuidSchema.nullable();
export const questionSchema=z.object({
 question_text:z.string().trim().min(5).max(12000),
 option_a:z.string().trim().min(1).max(4000),option_b:z.string().trim().min(1).max(4000),option_c:z.string().trim().min(1).max(4000),option_d:z.string().trim().min(1).max(4000),
 correct_answer:answerSchema.nullable(),explanation:z.string().max(20000).nullable(),
 option_explanations:z.object({A:z.string().max(10000),B:z.string().max(10000),C:z.string().max(10000),D:z.string().max(10000)}),
 subject_id:uuidSchema,unit_id:uuidSchema,topic_id:nullableId,subtopic_id:nullableId.optional(),exam_program_id:nullableId.optional(),
 difficulty:z.enum(['EASY','MEDIUM','HARD']).nullable(),cognitive_level:z.enum(['RECALL','UNDERSTANDING','APPLICATION']).nullable(),
 source_type:z.enum(['MANUAL','PAST_PAPER','CSV','CONTRIBUTION','AI','EXTERNAL']),source_year:z.number().int().min(1900).max(2200).nullable(),
 source_document:z.string().max(500).nullable(),source_url:z.url().refine(v=>/^https?:\/\//.test(v)).nullable(),source_page:z.number().int().positive().nullable(),source_question_number:z.string().max(100).nullable(),
 provenance:z.record(z.string(),z.json()).default({})
}).strict().refine(q=>new Set([q.option_a,q.option_b,q.option_c,q.option_d].map(v=>v.toLowerCase())).size===4,{message:'Options must be distinct'});
export type QuestionInput=z.infer<typeof questionSchema>;
export type Role='STUDENT'|'MODERATOR'|'ADMIN'|'SUPER_ADMIN';
export type Profile={id:string;display_name:string;role:Role;target_score:number|null;timezone:string;exam_program_id:string|null};
export type AcademicRow={id:string;name:string;code?:string;subject_id?:string;unit_id?:string;exam_group_id?:string;source_text?:string};
export type Taxonomy={programs:AcademicRow[];groups:AcademicRow[];subjects:AcademicRow[];units:AcademicRow[];topics:AcademicRow[];blueprints:Blueprint[];allocations:{blueprint_id:string;unit_id:string;subject_id:string;question_count:number}[]};
export type Blueprint={id:string;exam_group_id:string;question_count:number;duration_seconds:number;marks_correct:number;marks_incorrect:number;marks_unanswered:number;qualification_rule:{type:string;threshold:number};cognitive_distribution:Record<string,number>};
export type Attempt={id:string;mode:string;status:'ACTIVE'|'COMPLETED'|'EXPIRED'|'ABANDONED';score:number|null;max_score:number|null;correct_count:number|null;incorrect_count:number|null;unanswered_count:number|null;started_at:string;expires_at:string;completed_at:string|null;scoring_policy:{correct:number;incorrect:number;unanswered:number}};
export type AttemptQuestion={attempt_id:string;question_id:string;position:number;selected_answer:z.infer<typeof answerSchema>|null;marked_for_review:boolean;revision:number;response_ms:number|null;is_correct:boolean|null;awarded_marks:number|null;snapshot:{id:string;question_text:string;option_a:string;option_b:string;option_c:string;option_d:string;subject_id:string;unit_id:string;topic_id:string|null;difficulty:string;cognitive_level:string};correct_answer?:z.infer<typeof answerSchema>;explanation?:string;option_explanations?:Record<string,string>;provenance?:Record<string,unknown>};
export type AttemptDetail={attempt:Attempt;questions:AttemptQuestion[];server_time:string};
