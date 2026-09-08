'use client';
import { ResponsiveContainer,LineChart,Line,XAxis,YAxis,Tooltip,CartesianGrid } from 'recharts';
import type { Dashboard } from '@/lib/analytics';
export function Performance({trends}:{trends:Dashboard['trends']}){
 if(trends.length<2)return <p className="muted">Complete two tests to see your score trend.</p>;
 return <div className="chart" role="img" aria-label="Score percentage across recent completed tests"><ResponsiveContainer width="100%" height={240}><LineChart data={trends.map((t,i)=>({...t,test:i+1,percentage:Number(t.percentage)}))}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="test"/><YAxis domain={['auto',100]} unit="%"/><Tooltip/><Line type="monotone" dataKey="percentage" stroke="#087f8c" strokeWidth={3} name="Score %"/></LineChart></ResponsiveContainer><details><summary>View trend values</summary><ol>{trends.map(t=><li key={t.id}>{t.mode}: {Number(t.percentage).toFixed(1)}%</li>)}</ol></details></div>;
}
