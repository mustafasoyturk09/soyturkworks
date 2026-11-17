import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeWeather,weatherCacheSeconds} from '../server/weather.mjs';

test('weather summary uses the current forecast and Istanbul day bounds',()=>{
  const row=(time,temperature,symbol)=>({time,data:{instant:{details:{air_temperature:temperature}},next_1_hours:{summary:{symbol_code:symbol}}}});
  const forecast={properties:{meta:{updated_at:'2026-11-17T09:00:00Z'},timeseries:[
    row('2026-11-16T20:00:00Z',2,'clearsky_night'),
    row('2026-11-17T09:00:00Z',8,'partlycloudy_day'),
    row('2026-11-17T10:00:00Z',11,'cloudy'),
    row('2026-11-17T12:00:00Z',13,'fair_day'),
  ]}};
  const result=summarizeWeather(forecast,'Kayseri',Date.parse('2026-11-17T10:20:00Z'));
  assert.equal(result.temperature,11);
  assert.equal(result.minimum,8);
  assert.equal(result.maximum,13);
  assert.equal(result.symbol,'cloudy');
  assert.equal(result.updatedAt,'2026-11-17T09:00:00Z');
});

test('weather parser rejects missing temperature and cache respects expiry',()=>{
  assert.throws(()=>summarizeWeather({properties:{timeseries:[{time:'2026-11-17T10:00:00Z',data:{instant:{details:{}}}}]}},'Kayseri'),/Sıcaklık/);
  const now=Date.parse('2026-11-17T10:00:00Z');
  assert.equal(weatherCacheSeconds('Tue, 17 Nov 2026 11:00:00 GMT',now),3600);
  assert.equal(weatherCacheSeconds(null,now),3600);
});
