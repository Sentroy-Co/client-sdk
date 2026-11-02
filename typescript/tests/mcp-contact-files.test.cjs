const { test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const { createHash } = require('node:crypto')
const { gzipSync } = require('node:zlib')
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { WebStandardStreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js')
const { connectSentroyMcp, sentroyMcpContactImportFileInfo, SentroyMcpError } = require('@sentroy-co/client-sdk/mcp')
const personal = 'mcp_' + 'a'.repeat(43), access = 'mcp_at_' + 'b'.repeat(43)
const uploadId = '123e4567-e89b-42d3-a456-426614174000', connectionId = '2'.repeat(24)
const content = Buffer.from('{"email":"person@example.test","name":"字"}\n')
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const fileHash = hash(content)
let server, origin, requests = [], accepted = personal, mode = 'normal'
before(async () => {
  server = http.createServer(async (request, output) => {
    try {
      const url = new URL(request.url, origin)
      const chunks = []; for await(const chunk of request) chunks.push(chunk)
      const bytes = Buffer.concat(chunks)
      requests.push({ method:request.method, url, headers:request.headers, body:bytes })
      if(request.headers.authorization !== `Bearer ${accepted}`) {output.writeHead(401);output.end('private diagnostic');return}
      if(url.pathname.includes('/contacts/exports/')) {
        const body = mode === 'gzip' ? gzipSync(content) : mode === 'hash' ? Buffer.from('X'.repeat(content.length)) : content
        output.writeHead(200, { 'content-type':'application/octet-stream','content-length':body.length,...(mode==='gzip'?{'content-encoding':'gzip'}:{}) });output.end(body);return
      }
      if(url.pathname.includes('/contacts/imports/')) {
        if(request.method !== 'PUT' || hash(bytes) !== fileHash) {output.writeHead(409);output.end('private diagnostic');return}
        output.writeHead(200, {'content-type':'application/json'});output.end(JSON.stringify({ uploadId, state:'ready', count:1, fileHash, expiresAt:currentExpiry }));return
      }
      if(url.pathname !== '/mcp/acme' || request.method !== 'POST') {output.writeHead(405);output.end();return}
      const incoming = new Request(new URL(request.url, origin), {method:'POST',headers:request.headers,body:bytes})
      const mcp = new McpServer({name:'contact-file-fixture',version:'1'})
      const transport = new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true})
      await mcp.connect(transport)
      const response=await transport.handleRequest(incoming)
      output.writeHead(response.status,Object.fromEntries(response.headers));output.end(Buffer.from(await response.arrayBuffer()));await mcp.close()
    } catch {output.writeHead(500);output.end('fixture failure')}
  })
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`
})
after(async()=>{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))})
let currentExpiry
function references(resource) {
  currentExpiry=new Date(Date.now()+600000).toISOString()
  return {
    export:{exportId:uploadId,format:'jsonl',bytes:content.length,fileHash,expiresAt:currentExpiry,requiresOriginalBearer:true,downloadUrl:`${resource}/contacts/exports/${uploadId}?connection=${connectionId}&hash=${fileHash}`},
    import:{uploadId,bytes:content.length,fileHash,expiresAt:currentExpiry,requiresOriginalBearer:true,uploadUrl:`${resource}/contacts/imports/${uploadId}?connection=${connectionId}`},
  }
}
const options=(patch={})=>({app:'mail',companySlug:'acme',origin,token:personal,...patch})
test('local file metadata snapshots bytes and reports UTF8 bytes/hash only for Blob, ArrayBuffer and byte views',async()=>{
  for(const body of [content,new Uint8Array(content),new Uint8Array(content).buffer,new Blob([content])])assert.deepEqual(await sentroyMcpContactImportFileInfo(body,'jsonl'),{bytes:content.length,fileHash,format:'jsonl'})
  for(const body of [new Uint8Array(),new Uint8Array(1048577),'raw string',{}])await assert.rejects(sentroyMcpContactImportFileInfo(body,'jsonl'),SentroyMcpError)
  await assert.rejects(sentroyMcpContactImportFileInfo(content,'xml'),SentroyMcpError)
})
test('actual authenticated HTTP export download checks byte length/hash, handles gzip and exposes an attachment without cookies',async()=>{
  const connection=await connectSentroyMcp(options())
  try{for(const kind of ['normal','gzip']){mode=kind;const response=await connection.downloadMailContactsExport(references(connection.resource).export);assert.equal(await response.text(),content.toString());assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(response.headers.get('content-disposition'),'attachment; filename="contacts.jsonl"');assert.equal(requests.at(-1).headers.cookie,undefined);assert.equal(requests.at(-1).headers.authorization,`Bearer ${personal}`)}}finally{mode='normal';await connection.close()}
})
test('export path, company, origin, ID, hash, expiry, method policy and query validation happen before loading a credential',async()=>{
  let calls=0
  const connection=await connectSentroyMcp(options({token:()=>{calls++;return personal}})),base=calls,ref=references(connection.resource).export
  try{for(const change of [
    {downloadUrl:ref.downloadUrl.replace(origin,'https://evil.test')},{downloadUrl:ref.downloadUrl.replace('/acme/','/other/')},
    {downloadUrl:ref.downloadUrl.replace('/exports/','/imports/')},{downloadUrl:ref.downloadUrl+'&token=private'},
    {downloadUrl:ref.downloadUrl+'&connection='+connectionId},{downloadUrl:ref.downloadUrl+'#fragment'},
    {downloadUrl:ref.downloadUrl.replace('http://','http://user:password@')},{exportId:'bad'},
    {fileHash:'0'.repeat(64)},{requiresOriginalBearer:false},{bytes:1048577},{bytes:-1},{format:'html'},{expiresAt:'1970-01-01T00:00:00.000Z'},
  ])await assert.rejects(connection.downloadMailContactsExport({...ref,...change}),SentroyMcpError);assert.equal(calls,base)}finally{await connection.close()}
})
test('export checksum mismatch and truncated or oversized bodies never return a usable Response',async()=>{
  let body=Buffer.from('X'.repeat(content.length))
  const connection=await connectSentroyMcp(options({fetch:async(input,init)=>new URL(String(input)).pathname.includes('/exports/')?new Response(body):fetch(input,init)}))
  try{const ref=references(connection.resource).export;await assert.rejects(connection.downloadMailContactsExport(ref),e=>e.code==='mcp_contact_file_hash_mismatch');for(const value of ['x','X'.repeat(content.length+1)]){body=Buffer.from(value);await assert.rejects(connection.downloadMailContactsExport(ref),SentroyMcpError)}}finally{await connection.close()}
})
test('download reference byte budget and hash survive mutable caller objects during credential loading',async()=>{
  let mutable
  const connection=await connectSentroyMcp(options({token:()=>{if(mutable){mutable.bytes=1048576;mutable.fileHash='0'.repeat(64);mutable.downloadUrl='https://evil.test'}return personal}}))
  try{mutable=references(connection.resource).export;assert.equal(await(await connection.downloadMailContactsExport(mutable)).text(),content.toString())}finally{await connection.close()}
})
test('actual upload sends exactly the local snapshot with the current credential, no cookies and no redirects',async()=>{
  let current=personal
  const connection=await connectSentroyMcp(options({token:()=>current}))
  try{const ref=references(connection.resource).import;current=access;accepted=access;const ack=await connection.uploadMailContactsImport(ref,new Blob([content]));assert.deepEqual(ack,{uploadId,state:'ready',count:1,fileHash,expiresAt:ref.expiresAt});const request=requests.at(-1);assert.equal(request.method,'PUT');assert.deepEqual(request.body,content);assert.equal(request.headers.cookie,undefined);assert.equal(request.headers.authorization,`Bearer ${access}`);assert.equal(request.headers['content-type'],'application/octet-stream')}finally{accepted=personal;await connection.close()}
})
test('import references cannot repurpose a credential for another app, company, endpoint, query, hash or expired reservation',async()=>{
  let calls=0
  const connection=await connectSentroyMcp(options({token:()=>{calls++;return personal}})),base=calls,ref=references(connection.resource).import
  try{for(const change of [
    {uploadUrl:ref.uploadUrl.replace(origin,'https://evil.test')},{uploadUrl:ref.uploadUrl.replace('/acme/','/other/')},
    {uploadUrl:ref.uploadUrl.replace('/imports/','/exports/')},{uploadUrl:ref.uploadUrl+'&hash='+fileHash},{uploadUrl:ref.uploadUrl+'&connection='+connectionId},
    {uploadUrl:ref.uploadUrl+'#fragment'},{uploadId:'bad'},{fileHash:'invalid'},{requiresOriginalBearer:false},{bytes:1048577},{bytes:0},{expiresAt:'invalid'},
  ])await assert.rejects(connection.uploadMailContactsImport({...ref,...change},content),SentroyMcpError);assert.equal(calls,base)}finally{await connection.close()}
})
test('wrong import size/hash is rejected before credential acquisition or HTTP; raw content never enters errors',async()=>{
  let calls=0
  const connection=await connectSentroyMcp(options({token:()=>{calls++;return personal}})),base=calls,ref=references(connection.resource).import
  try{for(const body of [Buffer.from('private local file'),Buffer.from('X'.repeat(content.length))])await assert.rejects(connection.uploadMailContactsImport(ref,body),e=>e instanceof SentroyMcpError&&!e.message.includes('private'));assert.equal(calls,base)}finally{await connection.close()}
})
test('upload snapshots both metadata and input bytes before a mutable credential callback runs',async()=>{
  let mutable,body
  const connection=await connectSentroyMcp(options({token:()=>{if(mutable){mutable.bytes=1;mutable.uploadUrl='https://evil.test';body.fill(0)}return personal}}))
  try{mutable=references(connection.resource).import;body=Buffer.from(content);await connection.uploadMailContactsImport(mutable,body);assert.deepEqual(requests.at(-1).body,content)}finally{await connection.close()}
})
test('upload refuses non-200, redirects and private diagnostics without following or exposing remote bodies',async()=>{
  let state=302,seen=[]
  const connection=await connectSentroyMcp(options({fetch:async(input,init)=>{if(new URL(String(input)).pathname.includes('/imports/')){seen.push(init);return new Response('private remote diagnostic',{status:state,headers:{location:'https://evil.test'}})}return fetch(input,init)}}))
  try{const ref=references(connection.resource).import;for(state of [302,401,409,500])await assert.rejects(connection.uploadMailContactsImport(ref,content),e=>e.status===state&&!e.message.includes('private'));assert.equal(seen.length,4);assert(seen.every(init=>init.redirect==='manual'&&init.credentials==='omit'))}finally{await connection.close()}
})
test('upload response is bounded and curated, and ID/hash/state/count/expiry mismatches refuse',async()=>{
  let ack
  const connection=await connectSentroyMcp(options({fetch:async(input,init)=>new URL(String(input)).pathname.includes('/imports/')?new Response(typeof ack==='string'?ack:JSON.stringify(ack)):fetch(input,init)}))
  try{const ref=references(connection.resource).import,good={uploadId,state:'ready',count:1,fileHash,expiresAt:ref.expiresAt};for(const change of [{uploadId:'other'},{state:'waiting'},{count:0},{count:101},{fileHash:'0'.repeat(64)},{expiresAt:new Date(Date.now()+90000).toISOString()}]){ack={...good,...change};await assert.rejects(connection.uploadMailContactsImport(ref,content),SentroyMcpError)}ack='private'.repeat(1000);await assert.rejects(connection.uploadMailContactsImport(ref,content),SentroyMcpError);ack={...good,private:'never return'};const result=await connection.uploadMailContactsImport(ref,content);assert.equal('private'in result,false)}finally{await connection.close()}
})
test('transfer deadlines and caller abort bound stalled credentials or response streams without extra HTTP calls',async()=>{
  let stalled=false,files=0
  const connection=await connectSentroyMcp(options({token:()=>stalled?new Promise(()=>{}):personal,fetch:async(input,init)=>{if(new URL(String(input)).pathname.includes('/contacts/')){files++;return new Response(new ReadableStream({start(){},cancel(){}}))}return fetch(input,init)}}))
  try{const refs=references(connection.resource);stalled=true;await assert.rejects(connection.uploadMailContactsImport(refs.import,content,{timeoutMs:10}),e=>e.code==='mcp_upload_aborted');await assert.rejects(connection.downloadMailContactsExport(refs.export,{timeoutMs:10}),e=>e.code==='mcp_download_aborted');assert.equal(files,0);stalled=false;await assert.rejects(connection.uploadMailContactsImport(refs.import,content,{timeoutMs:10}),SentroyMcpError);await assert.rejects(connection.downloadMailContactsExport(refs.export,{timeoutMs:10}),SentroyMcpError);const abort=new AbortController();abort.abort();await assert.rejects(connection.uploadMailContactsImport(refs.import,content,{signal:abort.signal}),SentroyMcpError)}finally{await connection.close()}
})
test('non-Mail connections cannot use contact-file helpers',async()=>{
  const connection=await connectSentroyMcp(options({app:'storage'}))
  try{const refs=references(connection.resource);await assert.rejects(connection.downloadMailContactsExport(refs.export),e=>e.code==='mcp_contact_files_not_supported');await assert.rejects(connection.uploadMailContactsImport(refs.import,content),e=>e.code==='mcp_contact_files_not_supported')}finally{await connection.close()}
})

test('only allowlisted upload validation reasons and bounded row numbers leave an error body',async()=>{
  let errorBody
  const connection=await connectSentroyMcp(options({fetch:async(input,init)=>new URL(String(input)).pathname.includes('/imports/')?new Response(JSON.stringify(errorBody),{status:422}):fetch(input,init)}))
  try{const ref=references(connection.resource).import;errorBody={error:'contact_import_duplicate_email',row:7,private:'secret contact'};await assert.rejects(connection.uploadMailContactsImport(ref,content),e=>e.code==='mcp_upload_failed'&&e.reason==='contact_import_duplicate_email'&&e.row===7&&!e.message.includes('secret'));errorBody={error:'private diagnostic',row:7};await assert.rejects(connection.uploadMailContactsImport(ref,content),e=>e.reason===undefined&&e.row===undefined)}finally{await connection.close()}
})
