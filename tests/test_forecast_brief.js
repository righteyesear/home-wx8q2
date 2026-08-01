const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const context = { console, window: {} };
context.window = context;
vm.createContext(context);
vm.runInContext(
    fs.readFileSync(path.join(root, 'js/forecast.js'), 'utf8'),
    context,
    { filename: 'js/forecast.js' }
);

const jmaFixture = [{
    reportDatetime: '2026-08-01T11:00:00+09:00',
    timeSeries: [
        {
            timeDefines: ['2026-08-01T11:00:00+09:00'],
            areas: [{
                area: { code: '130010', name: '東京地方' },
                weatherCodes: ['101'],
                weathers: ['晴れ　時々　くもり']
            }]
        },
        {
            timeDefines: [
                '2026-08-01T12:00:00+09:00',
                '2026-08-01T18:00:00+09:00',
                '2026-08-02T00:00:00+09:00'
            ],
            areas: [{
                area: { code: '130010', name: '東京地方' },
                pops: ['10', '60', '40']
            }]
        }
    ]
}];

const parsed = context.parseJmaForecastPayload(
    jmaFixture,
    new Date('2026-08-01T15:00:00+09:00')
);
assert.strictEqual(parsed.weatherText, '晴れ 時々 くもり');
assert.strictEqual(parsed.weatherCode, '101');
assert.deepStrictEqual(
    Array.from(parsed.periods, period => period.probability),
    [10, 60, 40]
);

const yahooFixture = {
    updated_at: '202608011500',
    data: [
        { type: 'observation', datetime: '202608011500', rainfall: 0 },
        { type: 'forecast', datetime: '202608011520', rainfall: 0.5 },
        { type: 'forecast', datetime: '202608011540', rainfall: 2 },
        { type: 'forecast', datetime: '202608011600', rainfall: 5 }
    ]
};
const yahoo = context.sampleYahooForecast(yahooFixture);
assert.deepStrictEqual(
    Array.from(yahoo.points, point => point.rainfall),
    [0, 0.5, 2, 5]
);

console.log('forecast brief tests passed');
