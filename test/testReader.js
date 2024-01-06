const path = require('path');
const TdxMinuteBarReader = require('../reader/minuteBarReader');
const TdxDailyBarReader = require('../reader/dailyBarReader');
const {log} = require('console');

const reader = new TdxMinuteBarReader();
const dayReader = new TdxDailyBarReader();

const result = reader.parseDataFromFile(path.join(__dirname, './sz000001.lc1'));
console.log(result.length);
const dayKLinePath = path.join(__dirname, './bj872895.day');
const dayResult = dayReader.parseDataFromFile(dayKLinePath);
console.log(dayResult.length);
dayReader.findSecurityBars(dayKLinePath, '2023-11-22', '2023-12-11', 0).then(
    dayRangeResult => console.log(dayRangeResult.length)
);
dayReader.findSecurityBars(dayKLinePath, '', '2023-12-11', 3).then(
    dayRangeResult => console.log(dayRangeResult.length)
);
(() => {
  console.time('findSecurityBars');
  Promise.all((() => {
    let arr = [];
    for (let i = 0; i < 1000; i++) {
      arr.push(
          dayReader.findSecurityBars(dayKLinePath, '2023-11-22', '2023-12-11', 0)
      );
    }
    return arr;
  })()).then(r => {
    console.log('findSecurityBars: ' + r.length);
    console.timeEnd('findSecurityBars');
  });
})();

