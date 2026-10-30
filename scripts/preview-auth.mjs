import {spawn} from 'node:child_process';
const port=Number(process.env.PORT||4180);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('Geçersiz önizleme portu.');
const command=new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url);
const child=spawn(process.execPath,[command.pathname,'dev','--ip','127.0.0.1','--port',String(port),'--var','APP_ORIGIN:http://127.0.0.1:'+port,'--var','LOCAL_MAILBOX:1','--var','OWNER_EMAIL:preview@example.invalid','--persist-to','.wrangler/preview'],{stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));
child.on('exit',code=>process.exit(code??1));
