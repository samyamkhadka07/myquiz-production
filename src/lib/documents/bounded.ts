export async function readRange(url:string,start:number,length:number,total:number):Promise<Uint8Array>{
 const response=await fetch(url,{headers:{Range:`bytes=${start}-${Math.min(total-1,start+length-1)}`},signal:AbortSignal.timeout(20000)});
 if(!response.ok||!response.body)throw new Error('SOURCE_READ_FAILED');
 if(response.status!==206&&(start!==0||total>length)){await response.body.cancel();throw new Error('STORAGE_RANGE_UNSUPPORTED');}
 const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>length)throw new Error('SOURCE_RANGE_EXCEEDED');chunks.push(value);}}finally{await reader.cancel();}
 if(size!==Math.min(length,total-start))throw new Error('SOURCE_TRUNCATED');
 const output=new Uint8Array(size);let offset=0;for(const c of chunks){output.set(c,offset);offset+=c.length;}return output;
}
export function csvRecords(bytes:Uint8Array,max=100,final=false){
 const records:Uint8Array[]=[];let quoted=false;let start=0;let i=0;
 for(;i<bytes.length;i++){
  if(bytes[i]===34){if(quoted&&bytes[i+1]===34){i++;continue;}quoted=!quoted;}
  if(bytes[i]===10&&!quoted){records.push(bytes.slice(start,i+1));start=i+1;if(records.length===max)break;}
 }
 if(final&&start<bytes.length&&records.length<max){if(quoted)throw new Error('Unterminated quoted CSV record');records.push(bytes.slice(start));start=bytes.length;}
 if(bytes.length-start>131072&&records.length<max)throw new Error('CSV record exceeds 128 KiB; original preserved for review');
 return {records,carry:bytes.slice(start)};
}
export function inspectDocxArchive(buffer:Uint8Array){
 const view=new DataView(buffer.buffer,buffer.byteOffset,buffer.byteLength);let eocd=-1;
 for(let i=buffer.length-22;i>=Math.max(0,buffer.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}
 if(eocd<0)throw new Error('Invalid DOCX archive');
 const count=view.getUint16(eocd+10,true);let offset=view.getUint32(eocd+16,true);let total=0;
 for(let i=0;i<count;i++){
  if(offset+46>buffer.length||view.getUint32(offset,true)!==0x02014b50)throw new Error('Invalid DOCX directory');
  const expanded=view.getUint32(offset+24,true);total+=expanded;
  if(expanded===0xffffffff||total>64*1024*1024)throw new Error('DOCX expanded content exceeds processor budget; original preserved');
  offset+=46+view.getUint16(offset+28,true)+view.getUint16(offset+30,true)+view.getUint16(offset+32,true);
 }
}
