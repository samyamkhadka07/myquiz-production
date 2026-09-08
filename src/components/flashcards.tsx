'use client';
import { useState } from 'react';
import { api } from '@/lib/client-api';
export type Flashcard={id:string;front:string;back:string;due:string;revision:number;state:Record<string,unknown>};
export function Flashcards({initial}:{initial:Flashcard[]}){
 const [cards,setCards]=useState(initial);const [revealed,setRevealed]=useState(false);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const card=cards[0];
 async function rate(rating:number){if(!card)return;setBusy(true);try{await api(`flashcards/${card.id}/review`,'POST',{rating,request_key:crypto.randomUUID()});setCards(await api<Flashcard[]>('flashcards'));setRevealed(false);setMessage('Review saved. Your next due date has been scheduled.');}catch(e){setMessage((e as Error).message);}finally{setBusy(false);}}
 return <>{message&&<p role="status">{message}</p>}{!card?<p className="card">No cards are due. Add flashcards from completed question reviews.</p>:<section className="card"><p className="eyebrow">{cards.length} due in this batch</p><h2>{card.front}</h2>{revealed?<><p className="question-text">{card.back}</p><div className="toolbar">{['Again','Hard','Good','Easy'].map((label,i)=><button key={label} className="button" disabled={busy} onClick={()=>void rate(i+1)}>{label}</button>)}</div></>:<button className="button" onClick={()=>setRevealed(true)}>Show answer</button>}</section>}</>;
}
