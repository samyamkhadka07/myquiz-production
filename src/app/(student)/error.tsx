'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <section className="card" role="alert"><h1>We could not load this page</h1><p>Your saved work is still in your account. Try again in a moment.</p><button onClick={reset} className="button">Try again</button></section>;}
