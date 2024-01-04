const path = require('path');
const TdxMinuteBarReader = require('../reader/minuteBarReader');
const TdxDailyBarReader = require('../reader/dailyBarReader');

const reader = new TdxMinuteBarReader();
const dayReader = new TdxDailyBarReader();

const result = reader.parseDataFromFile(path.join(__dirname, './sz000001.lc1'));
console.log(result.length);
const dayResult = dayReader.parseDataFromFile(path.join(__dirname, './bj872895.day'));
console.log(dayResult.length);
const dayRangeResult = dayReader.findSecurityBars(path.join(__dirname, './bj872895.day'), '2023-11-22', '2023-12-11', 0);
console.log(dayRangeResult.length);
const dayCountResult = dayReader.findSecurityBars(path.join(__dirname, './bj872895.day'), '', '2023-12-11', 3);
console.log(dayCountResult.length);

