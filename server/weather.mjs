export const WEATHER_CITIES=Object.freeze({
  Kayseri:{lat:38.7205,lon:35.4826},
  İstanbul:{lat:41.0082,lon:28.9784},
  Ankara:{lat:39.9334,lon:32.8597},
  İzmir:{lat:38.4192,lon:27.1287},
  Bursa:{lat:40.1950,lon:29.0608},
  Antalya:{lat:36.8969,lon:30.7133},
});

const istanbulDay=value=>new Date(value).toLocaleDateString('sv-SE',{timeZone:'Europe/Istanbul'});
const istanbulHour=value=>Number(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Istanbul',hour:'2-digit',hourCycle:'h23'}).format(new Date(value)));
const symbolOf=row=>row?.data?.next_1_hours?.summary?.symbol_code||row?.data?.next_6_hours?.summary?.symbol_code||row?.data?.next_12_hours?.summary?.symbol_code||'';

export function summarizeWeather(payload,city,now=Date.now()){
  const rows=payload?.properties?.timeseries;
  if(!Array.isArray(rows)||!rows.length)throw Error('Hava tahmini bulunamadı.');
  const current=rows.find(row=>Date.parse(row.time)>=now-3600000)||rows[0];
  const temperature=Number(current?.data?.instant?.details?.air_temperature);
  if(!Number.isFinite(temperature))throw Error('Sıcaklık okunamadı.');
  const today=istanbulDay(now);
  const temperatures=rows.filter(row=>istanbulDay(row.time)===today).map(row=>Number(row.data?.instant?.details?.air_temperature)).filter(Number.isFinite);
  const symbol=symbolOf(current);
  const grouped=new Map();
  for(const row of rows){
    const date=istanbulDay(row.time),value=Number(row?.data?.instant?.details?.air_temperature);
    if(date<today||!Number.isFinite(value))continue;
    if(!grouped.has(date))grouped.set(date,[]);
    grouped.get(date).push({row,value});
  }
  const days=[...grouped].slice(0,5).map(([date,entries])=>{
    const representative=entries.reduce((best,item)=>Math.abs(istanbulHour(item.row.time)-12)<Math.abs(istanbulHour(best.row.time)-12)?item:best);
    return {date,minimum:Math.round(Math.min(...entries.map(x=>x.value))),maximum:Math.round(Math.max(...entries.map(x=>x.value))),symbol:symbolOf(representative.row)||symbol};
  });
  return {city,temperature:Math.round(temperature),minimum:temperatures.length?Math.round(Math.min(...temperatures)):null,maximum:temperatures.length?Math.round(Math.max(...temperatures)):null,symbol,days,validAt:current.time,updatedAt:payload.properties?.meta?.updated_at||null};
}

export function weatherCacheSeconds(expires,now=Date.now()){
  const seconds=Math.ceil((Date.parse(expires||'')-now)/1000);
  return Number.isFinite(seconds)?Math.max(900,seconds):3600;
}
