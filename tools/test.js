'use strict';
// Explicit filenames work in Windows shells and Unix, without shell globbing.
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),network=process.argv.includes('--network');
const files=fs.readdirSync(path.join(root,'tests')).filter(name=>name.endsWith('.test.js')&&name.endsWith('session.test.js')===network).sort().map(name=>'tests/'+name);
if(!files.length)throw new Error('No test files selected');
// All real UDP files share a host port; never run them concurrently.
const result=spawnSync(process.execPath,['--test',...(network?['--test-concurrency=1']:[]),...files],{cwd:root,stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status===null?1:result.status;
