'use client';
export default function ErrorPage({reset}:{error:Error&{digest?:string};reset:()=>void}){return <section className="card error" role="alert"><h1>Admin workspace unavailable</h1><p>The authorized data query could not be completed. No action was applied.</p><button className="button" onClick={reset}>Retry</button></section>}
