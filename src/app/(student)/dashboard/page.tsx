import Link from 'next/link';
import type { Route } from 'next';
import { requirePage } from '@/lib/server/auth';
import { check, taxonomy } from '@/lib/server/data';
import { numeric, type Dashboard } from '@/lib/analytics';
import { Performance } from '@/components/performance';
import { TodayPlan } from '@/components/today-plan';
import {NotificationActions} from '@/components/subscription-notification-actions';

type PlanItem = { id:string; kind:string; title:string; target_count:number; completed:boolean; metadata:{href?:string;available?:number} };

export default async function Page({searchParams}:{searchParams:Promise<{admin_request?:string}>}) {
  const adminRequest=(await searchParams).admin_request;
  const {db,profile}=await requirePage();
  const [dashboardResult,tax,planResult,activeResult,dueResult,mistakeResult,notificationsResult]=await Promise.all([
    db.rpc('get_dashboard'),taxonomy(),db.rpc('get_today_plan'),
    db.from('attempts').select('id,mode,last_activity_at').eq('user_id',profile.id).eq('status','ACTIVE').maybeSingle(),
    db.from('flashcards').select('id',{count:'exact',head:true}).eq('user_id',profile.id).lte('due',new Date().toISOString()),
    db.from('attempt_questions').select('question_id',{count:'exact',head:true}).eq('is_correct',false),
    db.from('subscription_notifications').select('id,title,message,created_at').eq('user_id',profile.id).is('dismissed_at',null).order('created_at',{ascending:false}).limit(3),
  ]);
  const d=check(dashboardResult) as Dashboard;
  const plan=check(planResult) as PlanItem[];
  check(activeResult);check(dueResult);check(mistakeResult);check(notificationsResult);
  const topics=d.dimensions.filter(item=>item.kind==='topic'&&item.answered).map(item=>({...item,accuracy:100*item.correct/item.answered})).sort((a,b)=>a.accuracy-b.accuracy);
  const weak=topics[0],strong=topics.at(-1);
  const topicName=(id?:string)=>tax.topics.find(item=>item.id===id)?.name??tax.units.find(item=>item.id===id)?.name??'MEC topic';
  const recent=d.trends.at(-1)?.percentage??d.accuracy??0,previous=d.trends.length>1?d.trends.at(-2)?.percentage??recent:recent,delta=recent-previous;
  const status=delta>3?'IMPROVING':delta<-3?'NEEDS ATTENTION':'STABLE';
  const estimatedOutOf200=(d.average_score??0)*2,target=Number(d.target_score??0),gap=target?target-estimatedOutOf200:null;
  const targetProgress=target?Math.min(100,100*estimatedOutOf200/target):0;
  const completedPlan=plan.filter(item=>item.completed).length,dailyProgress=plan.length?100*completedPlan/plan.length:0;
  const latestSessionTime=d.trends.reduce((latest,trend)=>Math.max(latest,new Date(trend.completed_at).getTime()),0);
  const weekStart=latestSessionTime-7*24*60*60*1000,weeklySessions=d.trends.filter(trend=>new Date(trend.completed_at).getTime()>=weekStart).length;
  const active=activeResult.data;
  const next=active?{title:'Continue your unfinished test',reason:'Your answers and remaining time are saved. Pick up exactly where you stopped.',href:`/quiz/${active.id}`,label:'Resume session'}:(dueResult.count??0)>0?{title:`Review ${Math.min(10,dueResult.count??0)} due flashcards`,reason:'These cards are due now, so reviewing them gives the strongest memory benefit.',href:'/flashcards',label:'Review cards'}:weak?{title:`Practice ${topicName(weak.value)}`,reason:`Your accuracy is ${numeric(weak.accuracy,'%')} across ${weak.answered} attempts. A short focused session can close this gap.`,href:'/tests',label:'Start focused practice'}:{title:'Take a 10-question diagnostic',reason:'A short baseline gives MyQuiz enough evidence to personalize every recommendation.',href:'/tests',label:'Start diagnostic'};
  const motivation=d.trends.length<2?'Complete two sessions to unlock a personal improvement trend.':delta>3?`Your recent accuracy improved by ${delta.toFixed(1)} percentage points. Keep the same study rhythm.`:delta<-3?`${topicName(weak?.value)} is the clearest recovery opportunity. Review mistakes before your next timed test.`:`Your performance is steady. A focused ${topicName(weak?.value)} session is the best next step.`;
  return <>
    {adminRequest?<section className="card section" role="status"><h2>Admin access {adminRequest==='pending'?'is awaiting approval':adminRequest==='rejected'?'was not approved':'is not active'}</h2><p>{adminRequest==='pending'?'A Super Admin must approve your request before the administration area becomes available.':adminRequest==='rejected'?'Your Admin request was rejected. Your student account remains active.':'Request Admin access and wait for Super Admin approval.'}</p></section>:null}
    {(notificationsResult.data??[]).map(n=><section className="card section attention-soft" key={n.id}><strong>{n.title}</strong><p>{n.message}</p><small>{new Date(n.created_at).toLocaleString()}</small><NotificationActions id={n.id}/></section>)}
    <section className="student-hero"><div><p className="eyebrow">Your personal MEC preparation coach</p><h1>Welcome back, {profile.display_name}</h1><p>{motivation}</p><div className="hero-actions"><Link href={next.href as Route} className="button button-bright">{next.label}</Link><Link href="/mistakes" className="button button-ghost">Retry mistakes</Link></div></div><div className="score-orbit" aria-label={`Predicted score ${estimatedOutOf200.toFixed(1)} out of 200`}><strong>{estimatedOutOf200.toFixed(0)}</strong><span>predicted</span><small>out of 200</small></div></section>
    <section className="dashboard-band" aria-label="Current learning progress"><article><span>Daily goal</span><strong>{completedPlan} / {plan.length||1} tasks</strong><div className="mini-progress"><i style={{width:`${dailyProgress}%`}}/></div></article><article><span>Target progress</span><strong>{target?`${estimatedOutOf200.toFixed(0)} / ${target}`:'Set your target'}</strong><div className="mini-progress"><i style={{width:`${targetProgress}%`}}/></div></article><article><span>Study streak</span><strong>{d.streak} days</strong><small>Consistency, not perfection</small></article><article><span>XP earned</span><strong>{d.xp.toLocaleString()}</strong><small>From completed learning</small></article></section>
    <section className="card next-action section"><div className="next-action-copy"><span className="step-number">01</span><div><p className="eyebrow">Next best action</p><h2>{next.title}</h2><p>{next.reason}</p></div></div><Link href={next.href as Route} className="button">{next.label}</Link></section>
    <TodayPlan initial={plan}/>
    <section className="stats overview-stats">{[
      ['Accuracy',numeric(d.accuracy,'%'),'Across answered questions'],['Questions',d.questions_attempted,'Practiced with feedback'],['This week',`${weeklySessions} sessions`,'Completed tests'],['Due cards',dueResult.count??0,'Ready for spaced review'],['Mistakes',mistakeResult.count??0,'Available to rescue'],['Target gap',gap==null?'Set target':gap>0?`${gap.toFixed(0)} marks`:'Target reached','Predicted-score difference'],
    ].map(([label,value,detail])=><article className="card metric-card" key={label}><span className="muted">{label}</span><div className="metric">{value}</div><small>{detail}</small></article>)}</section>
    {d.tests_completed===0?<section className="card onboarding section"><p className="eyebrow">Start with evidence</p><h2>Build your first personalized plan</h2><p>Take a diagnostic, explore the verified MEC syllabus, or begin with a gentle flashcard session.</p><div className="toolbar"><Link href="/tests" className="button">Start diagnostic</Link><Link href="/reading" className="button secondary">Explore syllabus</Link><Link href="/flashcards" className="button secondary">Try flashcards</Link></div></section>:null}
    <div className="dashboard-grid section"><section className="card trend-card"><div className="top"><div><p className="eyebrow">Progress trend</p><h2>Am I improving?</h2></div><strong className={status==='IMPROVING'?'status-improving':status==='STABLE'?'status-stable':'status-attention'}>{status}</strong></div><Performance trends={d.trends}/><p>{motivation}</p></section><section className="card focus-card"><p className="eyebrow">Learning focus</p><h2>Strengths and opportunities</h2>{strong?<div className="focus-item success-soft"><span>Strong topic</span><strong>{topicName(strong.value)}</strong><small>{numeric(strong.accuracy,'%')} accuracy</small></div>:null}{weak?<div className="focus-item attention-soft"><span>Needs attention</span><strong>{topicName(weak.value)}</strong><small>{numeric(weak.accuracy,'%')} accuracy · {weak.mistakes} mistakes</small></div>:null}{!strong&&!weak?<p className="muted">Your strongest and weakest topics appear after the diagnostic.</p>:null}<Link href="/recommendations" className="text-link">Open adaptive study plan</Link></section></div>
    <section className="card section"><div className="top"><div><p className="eyebrow">Mastery map</p><h2>Subject readiness</h2></div><Link href="/tests" className="button secondary">Practice a subject</Link></div><div className="mastery-grid">{d.dimensions.filter(item=>item.kind==='subject'&&item.answered).map(item=>{const accuracy=100*item.correct/item.answered;return <article className="mastery-tile" key={item.value}><div><strong>{tax.subjects.find(subject=>subject.id===item.value)?.name??'Subject'}</strong><span>{item.answered} questions</span></div><div className="bar"><i style={{width:`${accuracy}%`}}/></div><strong>{numeric(accuracy,'%')}</strong></article>})}</div>{!d.dimensions.some(item=>item.kind==='subject'&&item.answered)?<p className="muted">Your subject mastery map appears after the diagnostic.</p>:null}</section>
  </>;
}
