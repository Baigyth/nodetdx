const path = require('path');
const TdxMinuteBarReader = require('../reader/minuteBarReader');
const TdxDailyBarReader = require('../reader/dailyBarReader');

const reader = new TdxMinuteBarReader();
const dayReader = new TdxDailyBarReader();

const result = reader.parseDataFromFile(path.join(__dirname, './sz000001.lc1'));
const dayResult = dayReader.parseDataFromFile(path.join(__dirname, './bj872895.day'));
console.log(JSON.stringify(result));
console.log(JSON.stringify(dayResult));
