// Technical state only: never log invoice contents, subscriptions or credentials.
export async function automationHealth(storage,revision,now=Date.now()){
  const [cycles,devices,outbox,nextCheck,alarm]=await Promise.all([
    storage.list({prefix:'push:cycle:'}),storage.list({prefix:'push:device:'}),
    storage.list({prefix:'push:outbox:'}),storage.get('automation:next-check'),storage.getAlarm()
  ]);
  return {type:'automation-health',at:now,nextCheck:nextCheck||null,alarm:alarm||null,
    devices:devices.size,activeDevices:[...devices.values()].filter(d=>d.revision===revision).length,
    queued:outbox.size,retrying:[...outbox.values()].filter(v=>v.attempts>0).length,
    cycles:[...cycles.values()].filter(c=>now-c.created<86400000).sort((a,b)=>b.created-a.created).slice(0,12).map(c=>({
      created:c.created,manual:c.manual,completed:c.completed||null,
      companies:c.companies.map(company=>({id:company.id,status:c.results?.[company.id]?.status||'pending',
        error:!!c.results?.[company.id]?.error,startError:!!c.startErrors?.[company.id]}))
    }))};
}
